"""Fall through a pole-to-pole vacuum tunnel in a PREM Earth (Dziewonski & Anderson 1981, isotropic densities).
Outputs gravity, pressure, speed, time vs depth; writes tools/physics/prem_fall.json."""
import json, math
R = 6371.0e3
G = 6.674e-11
def rho(r):  # kg/m^3, r in m
    x = r / R; rk = r / 1e3
    if rk <= 1221.5: d = 13.0885 - 8.8381 * x * x
    elif rk <= 3480.0: d = 12.5815 - 1.2638 * x - 3.6426 * x * x - 5.5281 * x ** 3
    elif rk <= 5701.0: d = 7.9565 - 6.4761 * x + 5.5283 * x * x - 3.0807 * x ** 3
    elif rk <= 5771.0: d = 5.3197 - 1.4836 * x
    elif rk <= 5971.0: d = 11.2494 - 8.0298 * x
    elif rk <= 6151.0: d = 7.1089 - 3.8045 * x
    elif rk <= 6346.6: d = 2.6910 + 0.6924 * x
    elif rk <= 6356.0: d = 2.900
    elif rk <= 6368.0: d = 2.600
    else: d = 1.020
    return d * 1000
N = 200000
dr = R / N
rs = [i * dr for i in range(N + 1)]
mass = [0.0] * (N + 1)
for i in range(1, N + 1):
    rm = (rs[i] + rs[i - 1]) / 2
    mass[i] = mass[i - 1] + 4 * math.pi * rm * rm * rho(rm) * dr
gr = [0.0] + [G * mass[i] / rs[i] ** 2 for i in range(1, N + 1)]
# pressure: integrate from surface inward
P = [0.0] * (N + 1)
for i in range(N - 1, -1, -1):
    rm = (rs[i] + rs[i + 1]) / 2
    P[i] = P[i + 1] + rho(rm) * (gr[i] + gr[i + 1]) / 2 * dr
# speed from energy: v^2/2 = integral_r^R g dr
V = [0.0] * (N + 1)
for i in range(N - 1, -1, -1):
    V[i] = math.sqrt(V[i + 1] ** 2 + 2 * (gr[i] + gr[i + 1]) / 2 * dr)
# time: integrate dt = dr / v (handle surface start analytically ~ sqrt(2 d / g))
T = [0.0] * (N + 1)
k0 = N - 50  # first 50 steps: constant-g start
T[k0] = math.sqrt(2 * (R - rs[k0]) / gr[N])
for i in range(k0 - 1, -1, -1):
    T[i] = T[i + 1] + dr / ((V[i] + V[i + 1]) / 2)
def at(depth_km):
    i = int(round((R - depth_km * 1e3) / dr))
    i = max(0, min(N, i))
    return dict(depth_km=depth_km, g=round(gr[i], 3), g_rel=round(gr[i] / gr[N], 3), v_kmh=round(V[i] * 3.6), v_kms=round(V[i] / 1e3, 3), t_s=round(T[i], 1), P_GPa=round(P[i] / 1e9, 2), P_atm=round(P[i] / 101325), rho=round(rho(rs[i])))
marks = [0.5, 1, 4, 12.262, 35, 100, 410, 660, 1000, 2000, 2891, 4000, 5150, 6000, 6371]
out = [at(d) for d in marks]
gmax_i = max(range(N + 1), key=lambda i: gr[i])
res = dict(
    fall_to_center_s=round(T[0], 1), through_s=round(2 * T[0], 1), period_s=round(4 * T[0], 1),
    vmax_kms=round(V[0] / 1e3, 3), vmax_kmh=round(V[0] * 3.6), g_surface=round(gr[N], 3),
    gmax=round(gr[gmax_i], 3), gmax_depth_km=round((R - rs[gmax_i]) / 1e3, 1), P_center_GPa=round(P[0] / 1e9, 1), marks=out,
    table=[dict(t=round(T[i], 2), depth=round((R - rs[i]) / 1e3, 3), v=round(V[i] * 3.6, 1), g=round(gr[i], 3), P=round(P[i] / 1e9, 3)) for i in range(N, -1, -500)],
    mass_kg=mass[N])
json.dump(res, open('tools/physics/prem_fall.json', 'w'))
print({k: v for k, v in res.items() if k not in ('table', 'marks')})
for m in out: print(m)
# air in the tunnel (isothermal 288 K, ideal gas): depth where air density = human density 985 kg/m^3
H = 8.314 * 288 / (0.02897 * 9.81)
print('scale height km', round(H / 1e3, 2), 'float depth km', round(H * math.log(985 / 1.225) / 1e3, 1))
# terminal velocity at surface, belly-down skydiver: m=80, CdA=0.7*1.0
print('terminal surface km/h', round(math.sqrt(2 * 80 * 9.81 / (1.225 * 0.7)) * 3.6))
