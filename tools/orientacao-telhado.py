"""Quanto um telhado perde por apontar para o lado errado — calculado, não citado.

Modelo: posição solar real + céu claro (Ineichen) + transposição para plano
inclinado (Hay-Davies). É uma aproximação de céu limpo: não tem nuvem, então os
valores ABSOLUTOS ficam otimistas. A RAZÃO entre orientações, que é o que o
texto usa, é muito menos sensível a isso.
"""
import pvlib, pandas as pd, numpy as np

CIDADES = {
    "Curitiba":       (-25.43, -49.27, 935),
    "São Paulo":      (-23.55, -46.63, 760),
    "Brasília":       (-15.79, -47.88, 1_172),
    "Fortaleza":      ( -3.73, -38.52, 21),
}
AZIMUTES = {"norte": 0, "nordeste": 45, "leste": 90, "sudeste": 135,
            "sul": 180, "sudoeste": 225, "oeste": 270, "noroeste": 315}

def anual(lat, lon, alt, azimute, inclinacao):
    t = pd.date_range("2025-01-01", "2025-12-31 23:00", freq="h", tz="America/Sao_Paulo")
    loc = pvlib.location.Location(lat, lon, "America/Sao_Paulo", alt)
    sol = loc.get_solarposition(t)
    ceu = loc.get_clearsky(t, model="ineichen")
    dni_extra = pvlib.irradiance.get_extra_radiation(t)
    poa = pvlib.irradiance.get_total_irradiance(
        surface_tilt=inclinacao, surface_azimuth=azimute,
        solar_zenith=sol["apparent_zenith"], solar_azimuth=sol["azimuth"],
        dni=ceu["dni"], ghi=ceu["ghi"], dhi=ceu["dhi"], dni_extra=dni_extra, model="haydavies")
    return float(poa["poa_global"].fillna(0).sum()) / 1000   # kWh/m²·ano

print("Irradiação anual no plano do telhado (kWh/m²·ano), céu claro,")
print("inclinação fixa de 20° — e a perda em relação ao NORTE.\n")
for cidade, (lat, lon, alt) in CIDADES.items():
    ref = anual(lat, lon, alt, AZIMUTES["norte"], 20)
    print(f"{cidade}  (lat {lat:.2f})   norte = {ref:6.0f} kWh/m²")
    for nome, az in AZIMUTES.items():
        if nome == "norte": continue
        v = anual(lat, lon, alt, az, 20)
        print(f"    {nome:10s} {v:6.0f}   {100*(v-ref)/ref:+6.1f}%")
    print()
