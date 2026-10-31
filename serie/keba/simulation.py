"""La physique des catastrophes : les dominos sont simulés, pas dessinés.

Greffe : pymunk 7.3.1 (MIT, moteur Chipmunk2D). Preuve REA ev_4e0663… : `Space.on_collision(type_a, type_b, begin,
pre_solve, post_solve, separate, data)` (space.py l. 611), rappels `(arbiter, space, data)` (_collision_handler.py
l. 11), force du choc par `Arbiter.total_impulse` (arbiter.py l. 179) : elle dose le volume des bruitages et le
tremblement de la caméra.
Pas de 1/240 s (4 pas par image à 60 i/s) ; les personnages sont des corps « pilotés » qui suivent leurs pistes et
bousculent les objets.
"""
from bisect import bisect_right
from dataclasses import dataclass

import pymunk

PAS = 1.0 / 240.0
SEUIL_CHOC = 60.0


@dataclass
class Choc:
    t: float
    a: str
    b: str
    force: float
    point: tuple


class Monde:
    def __init__(self, sol_y: float, gravite: float = 2600.0, gauche: float = -3000.0, droite: float = 8000.0):
        self.espace = pymunk.Space()
        self.espace.gravity = (0.0, gravite)
        self.espace.iterations = 25
        self.sol_y = sol_y
        sol = pymunk.Segment(self.espace.static_body, (gauche, sol_y + 2.0), (droite, sol_y + 2.0), 2.0)   # surface = sol_y
        sol.friction, sol.elasticity = 0.9, 0.35
        self.espace.add(sol)
        self.noms = {id(sol): "sol"}
        self.corps: dict[str, pymunk.Body] = {}
        self.pilotes: dict[str, callable] = {}
        self.temps: list[float] = [0.0]
        self.traces: dict[str, list] = {}
        self.chocs: list[Choc] = []
        self.t = 0.0
        self.espace.on_collision(post_solve=self._choc)

    # --- objets -------------------------------------------------------------------------------------------------

    def _forme(self, corps, forme, taille):
        if forme == "rond":
            return pymunk.Circle(corps, float(taille))
        w, h = taille
        return pymunk.Poly.create_box(corps, (float(w), float(h)), radius=1.0)

    def ajouter(self, nom, forme, taille, masse, position, angle=0.0, elasticite=0.4, friction=0.7, fige=False):
        corps = pymunk.Body(body_type=pymunk.Body.KINEMATIC if fige else pymunk.Body.DYNAMIC)
        corps.position = (float(position[0]), float(position[1]))
        corps.angle = float(angle)
        f = self._forme(corps, forme, taille)
        f.mass, f.elasticity, f.friction = float(masse), elasticite, friction
        self.espace.add(corps, f)
        self.noms[id(f)] = nom
        self.corps[nom] = corps
        self.traces[nom] = [(corps.position.x, corps.position.y, corps.angle)] * len(self.temps)
        return corps

    def ajouter_pilote(self, nom, forme, taille, trajectoire):
        """Corps qui suit `trajectoire(t) -> (x, y, angle)` (un pied, une tête, le mouton qui charge)."""
        corps = pymunk.Body(body_type=pymunk.Body.KINEMATIC)
        x, y, a = trajectoire(self.t)
        corps.position, corps.angle = (x, y), a
        f = self._forme(corps, forme, taille)
        f.elasticity, f.friction = 0.3, 0.8
        self.espace.add(corps, f)
        self.noms[id(f)] = nom
        self.corps[nom] = corps
        self.pilotes[nom] = trajectoire
        self.traces[nom] = [(x, y, a)] * len(self.temps)
        return corps

    def liberer(self, nom):
        corps = self.corps[nom]
        corps.body_type = pymunk.Body.DYNAMIC
        corps.activate()

    def impulsion(self, nom, impulsion, point=None):
        corps = self.corps[nom]
        if corps.body_type == pymunk.Body.KINEMATIC and nom not in self.pilotes:
            self.liberer(nom)
        corps.activate()
        corps.apply_impulse_at_world_point(impulsion, point if point is not None else corps.position)

    # --- marche du temps -----------------------------------------------------------------------------------------

    def _choc(self, arbitre, espace, donnees):
        if not arbitre.is_first_contact:
            return
        force = abs(arbitre.total_impulse)
        if force < SEUIL_CHOC:
            return
        a, b = (self.noms.get(id(s), "?") for s in arbitre.shapes)
        pts = arbitre.contact_point_set.points
        point = (pts[0].point_a.x, pts[0].point_a.y) if pts else (0.0, 0.0)
        self.chocs.append(Choc(round(self.t + PAS, 6), a, b, force, point))

    def avancer_jusqua(self, t_fin: float):
        while self.t < t_fin - 1e-9:
            suivant = self.t + PAS
            for nom, trajectoire in self.pilotes.items():
                corps = self.corps[nom]
                x0, y0, a0 = trajectoire(self.t)
                x1, y1, a1 = trajectoire(suivant)
                corps.position, corps.angle = (x0, y0), a0
                corps.velocity = ((x1 - x0) / PAS, (y1 - y0) / PAS)
                corps.angular_velocity = (a1 - a0) / PAS
            self.espace.step(PAS)
            self.t = round(suivant, 9)
            for nom, trajectoire in self.pilotes.items():
                x1, y1, a1 = trajectoire(self.t)
                self.corps[nom].position, self.corps[nom].angle = (x1, y1), a1
            self.temps.append(self.t)
            for nom, corps in self.corps.items():
                self.traces[nom].append((corps.position.x, corps.position.y, corps.angle))

    def etat(self, nom: str, t: float):
        trace = self.traces[nom]
        if t <= self.temps[0]:
            return trace[0]
        if t >= self.temps[-1]:
            return trace[-1]
        i = bisect_right(self.temps, t)
        t0, t1 = self.temps[i - 1], self.temps[i]
        k = (t - t0) / (t1 - t0)
        (x0, y0, a0), (x1, y1, a1) = trace[i - 1], trace[i]
        return (x0 + (x1 - x0) * k, y0 + (y1 - y0) * k, a0 + (a1 - a0) * k)
