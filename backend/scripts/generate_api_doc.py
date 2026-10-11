"""
docs/API.md'yi FastAPI uygulamasının kendisinden üretir (elle tutulan liste
eskimesin diye). Her uç nokta için yöntem, yol, gereken yetki ve özet yazılır.

Çalıştırma (backend/ dizininden):
    python -m scripts.generate_api_doc
"""
import inspect
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from fastapi.routing import APIRoute  # noqa: E402

from app.main import app  # noqa: E402

OUT = ROOT.parent / "docs" / "API.md"


def _auth(route: APIRoute) -> str:
    names = []

    def walk(dep):
        for d in dep.dependencies:
            names.append(getattr(d.call, "__qualname__", getattr(d.call, "__name__", "")))
            walk(d)

    walk(route.dependant)
    text = " ".join(names)
    if "require_org_role" in text:
        # Kapanıştaki izinli rolleri oku.
        for d in route.dependant.dependencies:
            closure = inspect.getclosurevars(d.call).nonlocals if inspect.isfunction(d.call) else {}
            roles = closure.get("allowed_roles")
            if roles:
                return "Kurum: " + ", ".join(roles)
        return "Kurum rolü"
    if "require_admin" in text:
        return "Platform admini"
    if "get_current_user" in text:
        return "Giriş"
    return "Herkese açık"


def _iter_routes(routes, prefix: str = "", tags=None):
    """(tam yol, APIRoute, etiket). FastAPI >= 0.14x include_router'ı tembel bir
    _IncludedRouter içine sarar; önek ve etiketler include_context'te durur."""
    for route in routes:
        if isinstance(route, APIRoute):
            yield prefix + route.path, route, (route.tags or tags or ["Diğer"])[0]
        elif hasattr(route, "original_router"):
            ctx = route.include_context
            yield from _iter_routes(route.original_router.routes, prefix + (ctx.prefix or ""), ctx.tags or tags)


def main() -> None:
    groups: dict = {}
    for path, route, tag in _iter_routes(app.routes):
        if not route.include_in_schema:
            continue
        summary = (inspect.getdoc(route.endpoint) or "").split("\n")[0].strip()
        for method in sorted(route.methods - {"HEAD", "OPTIONS"}):
            groups.setdefault(tag, []).append((path, method, _auth(route), summary))

    lines = [
        "# API uç noktaları",
        "",
        "Bu dosya `python -m scripts.generate_api_doc` ile koddan üretilir; elle düzenlemeyin.",
        "Etkileşimli belge: backend çalışırken `/docs` (Swagger) ve `/redoc`.",
        "",
        "Yetki sütunu: *Giriş* = geçerli oturum; *Kurum: …* = o kurumdaki rol (platform admini her kuruma erişir);",
        "kaynak sahipliği (ör. kendi mülakatın, kendi CV'n) ayrıca servis katmanında doğrulanır.",
        "",
    ]
    for tag in sorted(groups):
        lines += [f"## {tag}", "", "| Yöntem | Yol | Yetki | Açıklama |", "|---|---|---|---|"]
        for path, method, auth, summary in sorted(groups[tag]):
            lines.append(f"| {method} | `{path}` | {auth} | {summary.replace('|', '/')} |")
        lines.append("")
    OUT.write_text("\n".join(lines), encoding="utf-8")
    print(f"{sum(len(v) for v in groups.values())} uç nokta yazıldı -> {OUT}")


if __name__ == "__main__":
    main()
