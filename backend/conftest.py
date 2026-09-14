import os
import sys

# Testler backend/ dışından (örn. proje kökünden) çalıştırılsa bile `app` paketinin
# import edilebilmesi için backend klasörünü sys.path'e ekler.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
