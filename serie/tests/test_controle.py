import subprocess

from keba.controle import controler


def _video(chemin, fige=False, son=True, duree=2, taille="216x384", fps=30):
    src = "color=c=orange:" if fige else "testsrc2="
    cmd = ["ffmpeg", "-loglevel", "error", "-y", "-f", "lavfi", "-i", f"{src}s={taille}:r={fps}:d={duree}"]
    if son:
        cmd += ["-f", "lavfi", "-i", f"sine=frequency=440:duration={duree}"]
    cmd += ["-c:v", "libx264", "-pix_fmt", "yuv420p"]
    if son:
        cmd += ["-c:a", "aac", "-shortest"]
    subprocess.run(cmd + [str(chemin)], check=True)
    return chemin


ATTENTES = {"largeur": 216, "hauteur": 384, "fps": 30, "duree": (1.5, 3.0)}


def test_une_bonne_video_passe_tous_les_controles(tmp_path):
    r = controler(_video(tmp_path / "ok.mp4"), **ATTENTES)
    assert r["ok"], r


def test_une_image_figee_est_bloquee(tmp_path):
    r = controler(_video(tmp_path / "fige.mp4", fige=True), **ATTENTES)
    assert not r["ok"] and "image figée" in " ".join(r["problemes"])


def test_une_video_muette_est_bloquee(tmp_path):
    r = controler(_video(tmp_path / "muet.mp4", son=False), **ATTENTES)
    assert not r["ok"] and "son" in " ".join(r["problemes"])


def test_un_mauvais_format_est_bloque(tmp_path):
    r = controler(_video(tmp_path / "carre.mp4", taille="300x300"), **ATTENTES)
    assert not r["ok"] and "format" in " ".join(r["problemes"])
