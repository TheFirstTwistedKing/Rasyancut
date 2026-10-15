"""신화적·천체적 UI 효과음 합성 v2 (열매를 눌러 유물이 깨어나는 소리)

사용: python3 tools/make_sfx.py            → assets/sfx/relic-awaken.wav
필요: numpy, scipy

v2 설계 (현실감 + 복합성 + 아름다움)
  A. 모달 종(교회종 비율)   : 단3도 부분음, 주파수 의존 감쇠, 모드가 둘로 갈라진 맥놀이(실제 종의 일렁임),
                              타격 직후 미세한 음정 상승(타격 비조화)
  B. 유리 폭포              : E단조 음계로 빠르게 상행하는 결정음 → 맨 위에서 길게 울리며 정착
  C. 유령 종                : 반음 위(단2도)의 약하고 늦은 종 → 아름답지만 편하지 않은 불안
  D. 별가루                 : 포아송 분포로 흩날리는 극소 결정음, 시간이 갈수록 성기게
  E. 기계 장치              : 래칫 틱(점점 느려지며 맞물림) + 서보 위잉 + 걸쇠 둔탁음
  F. 공명                   : 장치음이 E 배음열 공진기를 건드려 생기는 공감 울림
  G. 서브                   : 거의 들리지 않는 거대한 존재감
  H. 공간                   : 초기반사 + 대역별로 감쇠가 다른 차가운 잔향(고역이 빨리 죽음)
  마스터: 아주 약한 새추레이션으로 응집 → 고역 정리 → 끝 페이드
"""
import numpy as np
from pathlib import Path
from scipy.io import wavfile
from scipy.signal import butter, sosfilt, fftconvolve, iirpeak, tf2sos

SR = 48000
DUR = 0.60
N = int(SR * DUR)
t = np.arange(N) / SR
rng = np.random.default_rng(20261015)

ROOT = 659.26            # E5. 곡의 조성에 맞추려면 이 값만 바꾸면 된다 (단조 계열 권장)
SEMI = 2 ** (1 / 12)

# ── 유틸 ───────────────────────────────────────────────────────
def env_exp(tau, attack=0.0004):
    a = np.minimum(1.0, t / attack) if attack > 0 else 1.0
    return a * np.exp(-t / tau)

def bp(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, hi], btype="band", fs=SR, output="sos"), x, axis=0)
def hp(x, f, order=2):
    return sosfilt(butter(order, f, btype="high", fs=SR, output="sos"), x, axis=0)
def lp(x, f, order=2):
    return sosfilt(butter(order, f, btype="low", fs=SR, output="sos"), x, axis=0)

def delayed(x, sec):
    d = int(round(sec * SR))
    y = np.zeros_like(x)
    if 0 < d < len(x):
        y[d:] = x[: len(x) - d]
    elif d == 0:
        y = x.copy()
    return y

def pan(mono, p):
    """p: -1(L) … +1(R), 등파워 패닝 → (N,2)"""
    a = (p + 1) * np.pi / 4
    return np.stack([mono * np.cos(a), mono * np.sin(a)], axis=1)

# ── A. 모달 종 ──────────────────────────────────────────────────
def modal_bell(f0, modes, tau_scale=1.0, hardness=0.5):
    """modes: [(비율, 진폭, 기준 감쇠초)]. 각 모드는 미세하게 갈라진 두 사인의 합(맥놀이)."""
    out = np.zeros(N)
    for ratio, amp, tau in modes:
        f = f0 * ratio
        if f > 20000:
            continue
        # 단단한 말렛일수록 고역 모드가 세게 여기됨
        amp = amp * (1.0 / (1.0 + (f / (900 + 5200 * hardness)) ** 2)) ** 0.5
        tau = tau * tau_scale * min(1.4, (ROOT / f) ** 0.35)
        split = rng.uniform(0.5, 2.0) * (0.6 + 0.5 * ratio) * 0.9     # Hz 단위 맥놀이
        glide = 1 + 0.0035 * np.exp(-t / 0.014)                       # 타격 직후 미세한 음정 상승
        att = 0.0003 + 0.0006 / (1 + ratio)
        for k, (df, w) in enumerate([(0.0, 0.62), (split, 0.38)]):
            ph0 = rng.uniform(0, 2 * np.pi)
            ph = 2 * np.pi * np.cumsum((f + df) * glide) / SR + ph0
            out += amp * w * np.sin(ph) * env_exp(tau * (1.0 if k == 0 else 0.85), att)
    return out

DARK_BELL = [  # 비율, 진폭, 감쇠  (교회종: hum / prime / minor third / fifth / nominal …)
    (0.50, 0.20, 0.40), (1.00, 0.55, 0.32), (1.19, 0.34, 0.27), (1.50, 0.18, 0.21),
    (2.00, 0.24, 0.17), (2.51, 0.11, 0.13), (3.01, 0.09, 0.10), (4.18, 0.055, 0.07),
    (5.43, 0.03, 0.05), (6.80, 0.02, 0.035),
]
GLASS = [(1.0, 0.30, 0.16), (2.32, 0.12, 0.06), (4.25, 0.06, 0.03), (6.63, 0.03, 0.02)]

# ── 타격 트랜지언트: 말렛 접촉음 + 디지털 틱 ─────────────────────
def strike_noise():
    n = rng.standard_normal(N)
    mallet = hp(n, 2500) * env_exp(0.0008, 0.00002) * 0.38                    # 단단한 접촉
    body = bp(n, 700, 2200) * env_exp(0.0025, 0.00005) * 0.22                 # 몸통을 때리는 무게
    L = int(0.0042 * SR)
    tt = np.arange(L) / SR
    fs = 6800 * (2800 / 6800) ** (tt / 0.0042)
    chirp = np.zeros(N)
    chirp[:L] = np.sin(2 * np.pi * np.cumsum(fs) / SR) * np.hanning(L * 2)[L:] * 0.42
    return mallet + body + chirp

# ── 믹스 버퍼 ──────────────────────────────────────────────────
dry = np.zeros((N, 2))

def add(mono, p=0.0, gain=1.0, at=0.0):
    dry[:] += pan(delayed(mono, at), p) * gain

# A. 어두운 종: 약간 스테레오로 벌린 이중 타격(미세 디튠)
bellA = modal_bell(ROOT, DARK_BELL, hardness=0.55)
bellB = modal_bell(ROOT * 1.0009, DARK_BELL, hardness=0.5)
add(bellA, -0.28, 0.58)
add(bellB, +0.28, 0.52, at=0.0006)

# 타격음
strike = strike_noise()
add(strike, 0.0, 1.0)

# B. 유리 폭포: E 단조 상행 → 마지막 음에서 길게 정착
cascade = [(ROOT * 2 * 1.0000, 0.0), (ROOT * 2 * 1.1892, 0.020), (ROOT * 2 * 1.4983, 0.041),
           (ROOT * 2 * 1.7818, 0.064), (ROOT * 4 * 1.0000, 0.090)]           # E6 G6 B6 D7 E7
for i, (f, when) in enumerate(cascade):
    last = i == len(cascade) - 1
    g = modal_bell(f, GLASS, tau_scale=1.9 if last else 0.9, hardness=0.9)
    amp = 0.30 if last else 0.17 + 0.03 * i
    add(g, [-0.55, -0.2, 0.15, 0.45, 0.0][i], amp, at=when + 0.012)

# C. 유령 종 (단2도 위, 늦게, 작게)
ghost = modal_bell(ROOT * SEMI, [(1.0, 0.30, 0.26), (1.19, 0.16, 0.2), (2.0, 0.11, 0.12), (3.0, 0.05, 0.07)])
add(ghost, 0.55, 0.30, at=0.034)
add(ghost, -0.55, 0.15, at=0.052)

# D. 별가루: 포아송 분포, 시간이 갈수록 성기게
scale_hz = [329.63, 392.0, 440.0, 493.88, 587.33]           # E G A B D (E 단조 펜타토닉)
t_ev, ev = 0.030, []
while t_ev < 0.46:
    rate = 95 * np.exp(-(t_ev - 0.03) / 0.16) + 6
    t_ev += rng.exponential(1.0 / rate)
    ev.append(t_ev)
for te in ev:
    base = rng.choice(scale_hz) * 2 ** rng.integers(3, 5)     # 2.6k–9.4k
    if rng.random() < 0.07:
        base = 698.46 * 2 ** rng.integers(3, 5)               # 아주 드문 F(단2도): 섬뜩한 한 점
    tau = rng.uniform(0.018, 0.07)
    amp = rng.uniform(0.012, 0.045) * np.exp(-te / 0.30)
    p_ = np.sin(2 * np.pi * base * t) * env_exp(tau, 0.0002)
    p_ += 0.3 * np.sin(2 * np.pi * base * 2.76 * t) * env_exp(tau * 0.4, 0.0002)
    add(p_, rng.uniform(-0.9, 0.9), amp, at=te)

# E. 기계 장치 ─ 래칫 틱(점점 느려지며 맞물림) + 서보 위잉 + 걸쇠 둔탁음
ratchet = [(0.000, 1.00), (0.026, 0.72), (0.054, 0.55), (0.088, 0.42), (0.130, 0.30), (0.182, 0.20)]
mech = np.zeros(N)
for when, a in ratchet:
    c = rng.uniform(2200, 3600)
    tick = bp(rng.standard_normal(N), c * 0.8, c * 1.3, 2) * env_exp(0.003, 0.00004) * 3.4
    tink = np.sin(2 * np.pi * rng.uniform(4800, 7600) * t) * env_exp(0.014, 0.00005) * 0.09
    mech += delayed(tick + tink, when) * a * 0.20
sweep_f = 240 * (1500 / 240) ** np.clip(t / 0.15, 0, 1)
ph = 2 * np.pi * np.cumsum(sweep_f) / SR
whirr = sum(np.sin(h * ph) / h for h in (1, 2, 3, 4)) * np.sin(np.pi * np.clip(t / 0.17, 0, 1)) ** 2
whirr = bp(whirr, 500, 3200) * 0.05
mech += whirr
f_latch = 140 * (70 / 140) ** np.clip(t / 0.06, 0, 1)
latch = np.sin(2 * np.pi * np.cumsum(f_latch) / SR) * env_exp(0.045, 0.0008) * 0.16
add(mech, 0.0, 1.0)
add(latch, 0.0, 1.0)

# F. 공감 공명: 장치음이 E 배음열 공진기를 건드린다
sym = np.zeros(N)
for fr in [164.81, 329.63, 493.88, 659.26, 784.0, 987.77, 1318.5]:
    b, a_ = iirpeak(fr, Q=70, fs=SR)
    sym += sosfilt(tf2sos(b, a_), mech + strike * 0.5)
add(sym, 0.0, 1.8)

# G. 서브: 거의 안 들리는 거대한 존재
f_sub = 41.2 * (1 + 0.035 * np.exp(-t / 0.12))
ph = 2 * np.pi * np.cumsum(f_sub) / SR
sub = (np.sin(ph) + 0.28 * np.sin(2 * ph)) * env_exp(0.26, 0.035) * 0.075
add(sub, 0.0, 1.0)

# ── H. 공간: 초기반사 + 대역별 감쇠가 다른 차가운 잔향 ───────────
def make_ir(seed):
    r = np.random.default_rng(seed)
    n = int(0.58 * SR)
    tt = np.arange(n) / SR
    ir = np.zeros(n)
    for ms, a in [(6.5, .55), (10.5, .42), (16.0, .34), (22.5, .27), (31.0, .20), (43.0, .14)]:
        i = int(ms / 1000 * SR + r.integers(-20, 20))
        ir[i] += a * (1 if r.random() < 0.5 else -1)
    ir = lp(ir, 9000)
    noise = r.standard_normal(n)
    for lo, hi, tau, g in [(120, 500, 0.17, 0.35), (500, 2000, 0.13, 0.5),
                           (2000, 6000, 0.095, 0.55), (6000, 16000, 0.055, 0.40)]:
        ir += bp(noise, lo, min(hi, SR / 2 - 1), 2) * np.exp(-tt / tau) * g * 3.0
    ir[: int(0.009 * SR)] *= np.linspace(0, 1, int(0.009 * SR)) ** 2
    return ir / np.sqrt((ir ** 2).sum())

irL, irR = make_ir(11), make_ir(23)
wet = np.stack([fftconvolve(dry[:, 0], irL)[:N], fftconvolve(dry[:, 1], irR)[:N]], axis=1)
wet = hp(wet, 150)
wet *= 0.36 * np.sqrt((dry ** 2).mean()) / (np.sqrt((wet ** 2).mean()) + 1e-12)
out = dry * 0.80 + wet

# ── 마스터 ─────────────────────────────────────────────────────
out -= out.mean(axis=0)
out = np.tanh(1.12 * out) / np.tanh(1.12)           # 아주 약한 응집(왜곡 아님)
out = lp(out, 17500)
fade = int(0.10 * SR)
out[-fade:] *= (np.cos(np.linspace(0, np.pi / 2, fade)) ** 2)[:, None]
out *= 0.89 / np.max(np.abs(out))                   # 피크 약 -1 dBFS

path = Path(__file__).resolve().parent.parent / "assets" / "sfx" / "relic-awaken.wav"
path.parent.mkdir(parents=True, exist_ok=True)
wavfile.write(path, SR, (out * 32767).astype(np.int16))
print("saved", path, f"{DUR:.2f}s", path.stat().st_size, "bytes")
