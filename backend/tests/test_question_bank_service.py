"""
`question_bank_service.fetch_question_pool` için birim testleri — Supabase ve
embedding API'sine gerçek istek ATILMAZ; `llm_service.embed_text` ve
`question_bank_service.supabase` mock'lanır.

Ana amaçlar:
  - Banka boş/yetersiz olduğunda ya da embedding/RPC hata verdiğinde
    fonksiyonun HER ZAMAN sessizce boş/kısmi bir liste döndürdüğünü (asla
    exception fırlatmadığını) doğrulamak — mülakat akışı bu garantiye
    dayanıyor (bkz. app/api/routes/interview.py:_ask_question).
  - Exposure control (times_served cezası) ve boşluk (gap) loglamanın
    doğru tetiklendiğini, ama HİÇBİR ZAMAN havuz sonucunu bozmadığını
    doğrulamak.

Çalıştırmak için (backend/ dizininden):
    pytest tests/test_question_bank_service.py -v
"""
import asyncio
from unittest.mock import AsyncMock, MagicMock

import app.services.question_bank_service as question_bank_service
from app.services.llm_service import llm_service


def run(coro):
    """pytest-asyncio eklentisine ihtiyaç duymadan async test gövdelerini çalıştırır (bkz. test_llm_service.py)."""
    return asyncio.run(coro)


class _FakeResult:
    def __init__(self, data):
        self.data = data


def _row(id_, similarity, times_served=0, role="Backend Developer", topic="Python", difficulty="ORTA", family_id=None):
    return {
        "id": id_, "question_text": f"Soru {id_}", "role": role, "topic": topic,
        "difficulty": difficulty, "times_served": times_served, "similarity": similarity,
        "family_id": family_id,
    }


def _fake_supabase(match_rows, gap_existing_row=None, family_chains=None):
    """
    `.rpc("match_questions", ...)` -> match_rows
    `.rpc("increment_times_served", ...)` -> no-op (sonuç kullanılmıyor)
    `.table("question_bank_gaps")` -> basit bir select/insert/update zinciri;
      `gap_existing_row` verilirse select bunu döndürür (upsert'in "güncelle"
      koluna girer), yoksa boş döner (insert koluna girer).
    `.table("question_bank")` (yalnızca aile zinciri lookup'ı için, bkz.
      _fetch_family_chain) -> `.eq("family_id", X)` çağrılan family_id'ye göre
      `family_chains[X]` döner (verilmemişse boş liste).
    """
    fake = MagicMock()

    def _rpc(name, params=None, **kwargs):
        m = MagicMock()
        if name == "match_questions":
            m.execute.return_value = _FakeResult(match_rows)
        elif name == "increment_times_served":
            m.execute.return_value = _FakeResult(None)
        else:
            raise AssertionError(f"Beklenmeyen RPC çağrısı: {name}")
        return m

    fake.rpc.side_effect = _rpc

    gaps_table = MagicMock()
    select_chain = MagicMock()
    select_chain.eq.return_value = select_chain
    select_chain.is_.return_value = select_chain
    select_chain.execute.return_value = _FakeResult([gap_existing_row] if gap_existing_row else [])
    gaps_table.select.return_value = select_chain
    gaps_table.insert.return_value.execute.return_value = _FakeResult([{"id": "new-gap"}])
    gaps_table.update.return_value.eq.return_value.execute.return_value = _FakeResult([{"id": "existing-gap"}])

    chains = family_chains or {}

    def _question_bank_select(*_args, **_kwargs):
        chain_builder = MagicMock()
        state = {"family_id": None}

        def _eq(field, value):
            if field == "family_id":
                state["family_id"] = value
            return chain_builder

        def _execute():
            return _FakeResult(list(chains.get(state["family_id"], [])))

        chain_builder.eq.side_effect = _eq
        chain_builder.execute.side_effect = _execute
        return chain_builder

    question_bank_table = MagicMock()
    question_bank_table.select.side_effect = _question_bank_select

    def _table(name):
        if name == "question_bank_gaps":
            return gaps_table
        if name == "question_bank":
            return question_bank_table
        raise AssertionError(f"Beklenmeyen table() çağrısı: {name}")

    fake.table.side_effect = _table
    fake._gaps_table = gaps_table  # testlerin doğrudan erişebilmesi için
    return fake


def _rpc_calls_named(fake_supabase, name):
    return [c for c in fake_supabase.rpc.call_args_list if c.args and c.args[0] == name]


def test_fetch_question_pool_returns_rows_above_threshold(monkeypatch):
    monkeypatch.setattr(question_bank_service.settings, "QUESTION_BANK_MIN_SIMILARITY", 0.35)
    monkeypatch.setattr(llm_service, "embed_text", AsyncMock(return_value=[0.1, 0.2, 0.3]))

    fake_supabase = _fake_supabase([_row("q1", 0.8), _row("q2", 0.5)])
    monkeypatch.setattr(question_bank_service, "supabase", fake_supabase)

    pool = run(question_bank_service.fetch_question_pool(
        role="Backend Developer", topic="Python", difficulty="ORTA", size=5,
    ))

    assert pool == [
        {"id": "q1", "question_text": "Soru q1", "similarity": 0.8},
        {"id": "q2", "question_text": "Soru q2", "similarity": 0.5},
    ]
    match_calls = _rpc_calls_named(fake_supabase, "match_questions")
    assert len(match_calls) == 1
    assert match_calls[0].args[1]["filter_difficulty"] == "ORTA"
    # match_count artık size değil, exposure yeniden-sıralaması için
    # size * QUESTION_BANK_CANDIDATE_POOL_MULTIPLIER (varsayılan 4).
    assert match_calls[0].args[1]["match_count"] == 5 * question_bank_service.settings.QUESTION_BANK_CANDIDATE_POOL_MULTIPLIER


def test_fetch_question_pool_drops_rows_below_threshold(monkeypatch):
    monkeypatch.setattr(question_bank_service.settings, "QUESTION_BANK_MIN_SIMILARITY", 0.6)
    monkeypatch.setattr(llm_service, "embed_text", AsyncMock(return_value=[0.1, 0.2, 0.3]))

    fake_supabase = _fake_supabase([
        _row("q1", 0.9, role="r", topic="t", difficulty=None),
        _row("q2", 0.4, role="r", topic="t", difficulty=None),
    ])
    monkeypatch.setattr(question_bank_service, "supabase", fake_supabase)

    pool = run(question_bank_service.fetch_question_pool(role="X", topic="Y", difficulty=None, size=5))

    assert len(pool) == 1
    assert pool[0]["id"] == "q1"


def test_fetch_question_pool_returns_empty_when_embedding_fails(monkeypatch):
    monkeypatch.setattr(llm_service, "embed_text", AsyncMock(side_effect=RuntimeError("AI servisi ile iletişim kurulamadı.")))
    fake_supabase = _fake_supabase([])
    monkeypatch.setattr(question_bank_service, "supabase", fake_supabase)

    pool = run(question_bank_service.fetch_question_pool(role="X", topic="Y", difficulty=None, size=5))

    assert pool == []
    fake_supabase.rpc.assert_not_called()


def test_fetch_question_pool_returns_empty_when_rpc_fails(monkeypatch):
    monkeypatch.setattr(llm_service, "embed_text", AsyncMock(return_value=[0.1, 0.2, 0.3]))
    fake_supabase = MagicMock()
    fake_supabase.rpc.return_value.execute.side_effect = RuntimeError("RPC bulunamadı")
    monkeypatch.setattr(question_bank_service, "supabase", fake_supabase)

    pool = run(question_bank_service.fetch_question_pool(role="X", topic="Y", difficulty=None, size=5))

    assert pool == []


def test_fetch_question_pool_returns_empty_when_supabase_not_configured(monkeypatch):
    monkeypatch.setattr(question_bank_service, "supabase", None)
    pool = run(question_bank_service.fetch_question_pool(role="X", topic="Y", difficulty=None, size=5))
    assert pool == []


def test_fetch_question_pool_returns_empty_when_size_zero(monkeypatch):
    fake_supabase = _fake_supabase([])
    monkeypatch.setattr(question_bank_service, "supabase", fake_supabase)
    pool = run(question_bank_service.fetch_question_pool(role="X", topic="Y", difficulty=None, size=0))
    assert pool == []
    fake_supabase.rpc.assert_not_called()


# --------------------------------------------------------------------------
# Exposure control (times_served cezası)
# --------------------------------------------------------------------------

def test_fetch_question_pool_penalizes_heavily_served_question(monkeypatch):
    """
    q1 embedding benzerliğinde daha yüksek ama çok kez sorulmuş; q2 biraz
    daha düşük benzerlikte ama hiç sorulmamış. Ceza yeterince büyükse q2 öne
    geçmeli — exposure control'ün gerçekten sıralamayı etkilediğini kanıtlar.
    """
    monkeypatch.setattr(question_bank_service.settings, "QUESTION_BANK_MIN_SIMILARITY", 0.1)
    monkeypatch.setattr(question_bank_service.settings, "QUESTION_BANK_EXPOSURE_PENALTY", 0.5)
    monkeypatch.setattr(llm_service, "embed_text", AsyncMock(return_value=[0.1, 0.2, 0.3]))

    fake_supabase = _fake_supabase([
        _row("cok-sorulmus", 0.50, times_served=50),
        _row("hic-sorulmamis", 0.45, times_served=0),
    ])
    monkeypatch.setattr(question_bank_service, "supabase", fake_supabase)

    pool = run(question_bank_service.fetch_question_pool(role="X", topic="Y", difficulty=None, size=1))

    assert pool[0]["id"] == "hic-sorulmamis"


def test_fetch_question_pool_increments_times_served_for_selected_questions(monkeypatch):
    monkeypatch.setattr(question_bank_service.settings, "QUESTION_BANK_MIN_SIMILARITY", 0.1)
    monkeypatch.setattr(llm_service, "embed_text", AsyncMock(return_value=[0.1, 0.2, 0.3]))

    fake_supabase = _fake_supabase([_row("q1", 0.8), _row("q2", 0.6)])
    monkeypatch.setattr(question_bank_service, "supabase", fake_supabase)

    run(question_bank_service.fetch_question_pool(role="X", topic="Y", difficulty=None, size=2))

    increment_calls = _rpc_calls_named(fake_supabase, "increment_times_served")
    assert len(increment_calls) == 1
    assert sorted(increment_calls[0].args[1]["question_ids"]) == ["q1", "q2"]


def test_fetch_question_pool_does_not_increment_times_served_when_pool_empty(monkeypatch):
    monkeypatch.setattr(question_bank_service.settings, "QUESTION_BANK_MIN_SIMILARITY", 0.9)
    monkeypatch.setattr(llm_service, "embed_text", AsyncMock(return_value=[0.1, 0.2, 0.3]))

    fake_supabase = _fake_supabase([_row("q1", 0.1)])  # eşik altı -> havuz boş
    monkeypatch.setattr(question_bank_service, "supabase", fake_supabase)

    run(question_bank_service.fetch_question_pool(role="X", topic="Y", difficulty=None, size=1))

    assert _rpc_calls_named(fake_supabase, "increment_times_served") == []


def test_fetch_question_pool_survives_when_increment_times_served_fails(monkeypatch):
    """times_served güncellemesi başarısız olsa bile havuz sonucu etkilenmemeli."""
    monkeypatch.setattr(question_bank_service.settings, "QUESTION_BANK_MIN_SIMILARITY", 0.1)
    monkeypatch.setattr(llm_service, "embed_text", AsyncMock(return_value=[0.1, 0.2, 0.3]))

    fake_supabase = MagicMock()

    def _rpc(name, params=None, **kwargs):
        m = MagicMock()
        if name == "match_questions":
            m.execute.return_value = _FakeResult([_row("q1", 0.8)])
        elif name == "increment_times_served":
            m.execute.side_effect = RuntimeError("bağlantı koptu")
        return m

    fake_supabase.rpc.side_effect = _rpc
    fake_supabase.table.side_effect = RuntimeError("hiç çağrılmamalı (pool dolu, gap yok)")
    monkeypatch.setattr(question_bank_service, "supabase", fake_supabase)

    pool = run(question_bank_service.fetch_question_pool(role="X", topic="Y", difficulty=None, size=1))

    assert pool == [{"id": "q1", "question_text": "Soru q1", "similarity": 0.8}]


# --------------------------------------------------------------------------
# Boşluk (gap) loglama
# --------------------------------------------------------------------------

def test_fetch_question_pool_logs_gap_when_pool_smaller_than_size(monkeypatch):
    monkeypatch.setattr(question_bank_service.settings, "QUESTION_BANK_MIN_SIMILARITY", 0.1)
    monkeypatch.setattr(llm_service, "embed_text", AsyncMock(return_value=[0.1, 0.2, 0.3]))

    fake_supabase = _fake_supabase([_row("q1", 0.8)])  # yalnızca 1 aday, size=3 istendi
    monkeypatch.setattr(question_bank_service, "supabase", fake_supabase)

    run(question_bank_service.fetch_question_pool(role="Uzay Mühendisi", topic="Roket", difficulty="UZMAN", size=3))

    fake_supabase._gaps_table.insert.assert_called_once()
    inserted = fake_supabase._gaps_table.insert.call_args.args[0]
    assert inserted["role"] == "Uzay Mühendisi"
    assert inserted["topic"] == "Roket"
    assert inserted["difficulty"] == "UZMAN"
    assert inserted["last_missing_count"] == 2  # 3 istendi, 1 bulundu -> 2 eksik


def test_fetch_question_pool_updates_existing_gap_miss_count(monkeypatch):
    monkeypatch.setattr(question_bank_service.settings, "QUESTION_BANK_MIN_SIMILARITY", 0.9)
    monkeypatch.setattr(llm_service, "embed_text", AsyncMock(return_value=[0.1, 0.2, 0.3]))

    fake_supabase = _fake_supabase([], gap_existing_row={"id": "gap-1", "miss_count": 3})
    monkeypatch.setattr(question_bank_service, "supabase", fake_supabase)

    run(question_bank_service.fetch_question_pool(role="X", topic="Y", difficulty=None, size=2))

    fake_supabase._gaps_table.update.assert_called_once()
    updated = fake_supabase._gaps_table.update.call_args.args[0]
    assert updated["miss_count"] == 4
    assert updated["last_missing_count"] == 2


def test_fetch_question_pool_does_not_log_gap_when_pool_full(monkeypatch):
    monkeypatch.setattr(question_bank_service.settings, "QUESTION_BANK_MIN_SIMILARITY", 0.1)
    monkeypatch.setattr(llm_service, "embed_text", AsyncMock(return_value=[0.1, 0.2, 0.3]))

    fake_supabase = _fake_supabase([_row("q1", 0.8), _row("q2", 0.7)])
    monkeypatch.setattr(question_bank_service, "supabase", fake_supabase)

    run(question_bank_service.fetch_question_pool(role="X", topic="Y", difficulty=None, size=2))

    fake_supabase._gaps_table.insert.assert_not_called()
    fake_supabase._gaps_table.update.assert_not_called()


def test_fetch_question_pool_survives_when_gap_logging_fails(monkeypatch):
    monkeypatch.setattr(question_bank_service.settings, "QUESTION_BANK_MIN_SIMILARITY", 0.1)
    monkeypatch.setattr(llm_service, "embed_text", AsyncMock(return_value=[0.1, 0.2, 0.3]))

    fake_supabase = _fake_supabase([_row("q1", 0.8)])
    fake_supabase._gaps_table.select.side_effect = RuntimeError("tablo bulunamadı")
    monkeypatch.setattr(question_bank_service, "supabase", fake_supabase)

    pool = run(question_bank_service.fetch_question_pool(role="X", topic="Y", difficulty=None, size=3))

    assert pool == [{"id": "q1", "question_text": "Soru q1", "similarity": 0.8}]


# --------------------------------------------------------------------------
# Soru aileleri (zorluk-artan zincir paketleme)
# --------------------------------------------------------------------------

def test_fetch_question_pool_expands_family_into_escalating_chain(monkeypatch):
    """
    En iyi eşleşme bir ailenin ORTA varyantıysa, havuz o aileden ORTA ve
    UZMAN varyantlarını (JUNIOR HARİÇ — eşleşen zorluktan daha kolay) zorluk
    artan sırada ardışık paketlemeli, kalan slot(lar) aile-dışı adaylarla
    doldurulmalı.
    """
    monkeypatch.setattr(question_bank_service.settings, "QUESTION_BANK_MIN_SIMILARITY", 0.1)
    monkeypatch.setattr(llm_service, "embed_text", AsyncMock(return_value=[0.1, 0.2, 0.3]))

    fake_supabase = _fake_supabase(
        [
            _row("fam-orta", 0.8, difficulty="ORTA", family_id="fam-1"),
            _row("other", 0.5, family_id=None),
        ],
        family_chains={
            "fam-1": [
                {"id": "fam-junior", "question_text": "Junior varyant", "difficulty": "JUNIOR"},
                {"id": "fam-orta", "question_text": "Orta varyant", "difficulty": "ORTA"},
                {"id": "fam-uzman", "question_text": "Uzman varyant", "difficulty": "UZMAN"},
            ]
        },
    )
    monkeypatch.setattr(question_bank_service, "supabase", fake_supabase)

    pool = run(question_bank_service.fetch_question_pool(role="X", topic="Y", difficulty=None, size=3))

    ids = [p["id"] for p in pool]
    assert ids == ["fam-orta", "fam-uzman", "other"]
    assert "fam-junior" not in ids  # eşleşen zorluktan daha kolay -> paketlenmemeli
    assert pool[0]["question_text"] == "Orta varyant"
    assert pool[1]["question_text"] == "Uzman varyant"


def test_fetch_question_pool_falls_back_to_single_row_when_family_chain_lookup_empty(monkeypatch):
    """Aile zinciri çekilemez/boş dönerse (RPC/tablo hatası, ya da satır
    yalnız kalmışsa), en azından eşleşen tek soru havuzda kalmalı — mülakat
    kesintiye uğramamalı."""
    monkeypatch.setattr(question_bank_service.settings, "QUESTION_BANK_MIN_SIMILARITY", 0.1)
    monkeypatch.setattr(llm_service, "embed_text", AsyncMock(return_value=[0.1, 0.2, 0.3]))

    fake_supabase = _fake_supabase([_row("fam-x", 0.8, family_id="orphan-family")], family_chains={})
    monkeypatch.setattr(question_bank_service, "supabase", fake_supabase)

    pool = run(question_bank_service.fetch_question_pool(role="X", topic="Y", difficulty=None, size=3))

    assert pool == [{"id": "fam-x", "question_text": "Soru fam-x", "similarity": 0.8}]


def test_fetch_question_pool_expands_same_family_only_once(monkeypatch):
    """İki farklı sıralanmış aday aynı aileye aitse, aile zinciri yalnızca
    İLK karşılaşmada bir kez çekilmeli — ikinci aday zaten `used_ids`
    içinde bulunup atlanmalı, tekrar bir table() sorgusu tetiklenmemeli."""
    monkeypatch.setattr(question_bank_service.settings, "QUESTION_BANK_MIN_SIMILARITY", 0.1)
    monkeypatch.setattr(llm_service, "embed_text", AsyncMock(return_value=[0.1, 0.2, 0.3]))

    fake_supabase = _fake_supabase(
        [
            _row("fam-a", 0.9, difficulty="ORTA", family_id="fam-1"),
            _row("fam-b", 0.85, difficulty="ORTA", family_id="fam-1"),
        ],
        family_chains={
            "fam-1": [
                {"id": "fam-a", "question_text": "A", "difficulty": "ORTA"},
                {"id": "fam-b", "question_text": "B", "difficulty": "ORTA"},
            ]
        },
    )
    monkeypatch.setattr(question_bank_service, "supabase", fake_supabase)

    pool = run(question_bank_service.fetch_question_pool(role="X", topic="Y", difficulty=None, size=5))

    assert sorted(p["id"] for p in pool) == ["fam-a", "fam-b"]
    question_bank_table = fake_supabase.table("question_bank")
    assert question_bank_table.select.call_count == 1
