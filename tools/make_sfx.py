"""신화적·천체적 UI 효과음 합성 (열매를 눌러 유물이 깨어나는 소리)

사용: python3 tools/make_sfx.py            → assets/sfx/relic-awaken.wav
필요: numpy, scipy

음색 설계
  1. 디지털 트랜지언트  : 극초단 하이패스 노이즈 + 6k→3k 칩 (선명한 첫 타격)
  2. 기계식 클릭        : 3연속 기어 틱 + 금속 링 (고대 장치의 맞물림)
  3. 어두운 종 몸통     : 단3도 부분음(1.2배)을 가진 교회종 비율 → 슬프고 엄숙한 금속 배음
  4. 수정 핑            : 순수 고음 사인 + 비조화 배음 (유리 같은 날카로운 결정음)
  5. 유령 종            : 반음 위(단2도) 약한 두 번째 타격 → 밝지 않은, 불안한 신성함
  6. 서브 저음          : 41Hz 안팎, 거의 들리지 않는 거대한 존재감
  7. 짧은 성스러운 잔향 : 차갑고 고역이 남는 합성 IR, 허공으로 사라짐
"""
import numpy as np
from pathlib import Path
from scipy.io import wavfile
from scipy.signal import butter, sosfilt, fftconvolve

SR = 48000
DUR = 0.58
N = int(SR * DUR)
t = np.arange(N) / SR
rng = np.random.default_rng(7)

ROOT = 659.26            # E5. 곡의 조성에 맞추려면 이 값만 바꾸면 된다 (단조 계열 권장)

def env_exp(tau, attack=0.0004, n=N):
    tt = np.arange(n) / SR
    a = np.minimum(1.0, tt / attack) if attack > 0 else 1.0
    return a * np.exp(-tt / tau)

def bp(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, hi], btype="band", fs=SR, output="sos"), x)
def hp(x, f, order=2):
    return sosfilt(butter(order, f, btype="high", fs=SR, output="sos"), x)
def lp(x, f, order=2):
    return sosfilt(butter(order, f, btype="low", fs=SR, output="sos"), x)

def delayed(x, sec):
    d = int(sec * SR)
    y = np.zeros_like(x)
    if d < len(x):
        y[d:] = x[: len(x) - d]
    return y

def bell(f0, ratios, amps, taus, attack=0.0004):
    out = np.zeros(N)
    for r, a, tau in zip(ratios, amps, taus):
        ph = rng.uniform(0, 2 * np.pi)
        out += a * np.sin(2 * np.pi * f0 * r * t + ph) * env_exp(tau, attack)
    return out

# ── 1. 디지털 트랜지언트 ────────────────────────────────────────
click = hp(rng.standard_normal(N), 3500) * env_exp(0.0007, 0.00003) * 0.55
sweep_len = int(0.004 * SR)
tt = np.arange(sweep_len) / SR
f_sweep = 6200 * (3000 / 6200) ** (tt / 0.004)
chirp = np.zeros(N)
chirp[:sweep_len] = np.sin(2 * np.pi * np.cumsum(f_sweep) / SR) * np.hanning(sweep_len * 2)[sweep_len:] * 0.5
transient = click + chirp

# ── 2. 기계식 클릭(기어 틱) + 금속 링 ────────────────────────────
mech = np.zeros(N)
for when, amp in [(0.0, 0.30), (0.027, 0.20), (0.053, 0.12)]:
    tick = bp(rng.standard_normal(N), 2300, 3600, 2) * env_exp(0.0035, 0.00005)
    mech += delayed(tick, when) * amp * 3.0
ring = np.sin(2 * np.pi * 4830 * t) * env_exp(0.028) * 0.05 + np.sin(2 * np.pi * 7150 * t) * env_exp(0.018) * 0.03
mech += ring

# ── 3. 어두운 종 몸통 (단3도 부분음) ─────────────────────────────
dark = bell(ROOT,
            ratios=[0.5, 1.0, 1.2, 1.5, 2.0, 2.5, 3.01, 4.2],
            amps=[0.20, 0.55, 0.32, 0.18, 0.22, 0.10, 0.08, 0.05],
            taus=[0.36, 0.30, 0.25, 0.19, 0.15, 0.11, 0.08, 0.055])

# ── 4. 수정 핑 (유리) ──────────────────────────────────────────
crystal = bell(ROOT * 4,
               ratios=[1.0, 1.5, 2.76, 5.4],
               amps=[0.20, 0.10, 0.07, 0.035],
               taus=[0.11, 0.14, 0.05, 0.025], attack=0.0002)
crystal += bell(ROOT * 6, ratios=[1.0], amps=[0.05], taus=[0.07], attack=0.0002)
crystal += bell(ROOT * 8, ratios=[1.0, 1.5], amps=[0.035, 0.018], taus=[0.05, 0.035], attack=0.0001)   # 날카로운 최상단 결정음

# ── 5. 유령 종: 반음 위, 살짝 늦게, 아주 작게 ────────────────────
ghost = bell(ROOT * 2 ** (1 / 12), ratios=[1.0, 1.2, 2.0], amps=[0.30, 0.16, 0.10], taus=[0.22, 0.17, 0.10])
ghost = delayed(ghost, 0.030) * 0.30

# ── 6. 서브 저음: 거의 안 들리는 거대한 존재 ─────────────────────
f_sub = 41.2 * (1 + 0.035 * np.exp(-t / 0.12))
phase = 2 * np.pi * np.cumsum(f_sub) / SR
sub = (np.sin(phase) + 0.3 * np.sin(2 * phase)) * env_exp(0.26, 0.035) * 0.075

# ── 믹스(드라이): 스테레오 폭은 약간만 ───────────────────────────
mid = dark * 0.95 + transient + mech * 0.8 + sub
L = mid + crystal * 1.9 + ghost * 0.8
R = mid + delayed(crystal, 0.0007) * 1.7 + ghost * 1.2
dry = np.stack([L, R], axis=1)

# ── 7. 성스러운 잔향: 차갑고 짧은 ────────────────────────────────
irn = int(0.5 * SR)
def make_ir():
    n = rng.standard_normal(irn)
    tt = np.arange(irn) / SR
    hi = hp(n, 2800) * np.exp(-tt / 0.075)
    lo = lp(n, 2800) * np.exp(-tt / 0.15) * 0.55
    ir = hi + lo
    ir[: int(0.010 * SR)] *= 0.0            # 프리딜레이 10ms
    return ir / np.max(np.abs(ir))
irL, irR = make_ir(), make_ir()
wet = np.stack([fftconvolve(dry[:, 0], irL)[:N], fftconvolve(dry[:, 1], irR)[:N]], axis=1)
wet = hp(wet.T, 140).T                       # 잔향의 저역 뭉침 제거
out = dry * 0.78 + wet * 0.0016 * 6.0

# ── 마무리: 직류 제거 · 끝 페이드 · 정규화 ───────────────────────
out -= out.mean(axis=0)
fade = int(0.09 * SR)
out[-fade:] *= (np.cos(np.linspace(0, np.pi / 2, fade)) ** 2)[:, None]
out *= 0.89 / np.max(np.abs(out))           # 피크 약 -1 dBFS

path = Path(__file__).resolve().parent.parent / "assets" / "sfx" / "relic-awaken.wav"
path.parent.mkdir(parents=True, exist_ok=True)
wavfile.write(path, SR, (out * 32767).astype(np.int16))
print("saved", path, f"{DUR:.2f}s", path.stat().st_size, "bytes")
