"""Quais faixas são abertura ou tema de desenho, anime ou série (categoria "Aberturas" do Faixa a Faixa).

O sincroniza_obras.py marca `ab: true` no dias.json. Vale:
- título com "abertura", "opening", "theme song" ou "(tema)" em qualquer categoria;
- título com "theme" / "main title" em desenhos (em filmes isso pega tema de cinema, como "Hedwig's Theme");
- a lista ABERTURAS abaixo: aberturas que não dizem isso no nome (anime e séries).
Tema de filme (Star Wars, Tubarão), encerramento e música de episódio ficam de fora.
"""
import re
import unicodedata

def _n(s):
    s = unicodedata.normalize('NFKD', s or '').encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', ' ', s).strip()

# (obra, começo do título) — conferido à mão em 09/11/2026
ABERTURAS = [
    # animes
    ("JoJo's Bizarre Adventure", 'Sono Chi no Sadame'), ('Dragon Ball Z', 'WE GOTTA POWER'), ('Dragon Ball Z', 'CHA-LA HEAD-CHA-LA'),
    ('Dragon Ball Z', 'Cha-La Head-Cha-La'), ('Dragon Ball GT', 'Sorriso Resplandecente'), ('Yu Yu Hakusho', 'Sorriso Contagiante'),
    ('Shingeki no Kyojin', 'Shinzou wo Sasageyo'), ('Shingeki no Kyojin', 'Guren No Yumiya'), ('Shingeki no Kyojin', 'The Rumbling'),
    ('Sword Art Online', 'Crossing Field'), ('Evangelion', "The Cruel Angel's Thesis"), ('Fullmetal Alchemist: Brotherhood', 'Again'),
    ('Fullmetal Alchemist', 'READY STEADY GO'), ('Cowboy Bebop', 'Tank!'), ('Inuyasha', 'Change the World'),
    ('Sakura Card Captors', 'Catch You Catch Me'), ('Naruto', 'Go!!!'), ('Naruto', 'Haruka Kanata'), ('Naruto Shippuden', 'Blue Bird'),
    ('Naruto Shippuden', 'Silhouette'), ('Solo Leveling', 'LEveL'), ('Os Cavaleiros do Zodíaco', 'Soldier Dream'),
    ('Os Cavaleiros do Zodíaco', 'Pegasus Fantasy'), ('Frieren', 'Yuusha'), ('Bleach', '*Asterisk'), ('Dan Da Dan', 'Otonoke'),
    ('My Hero Academia', 'Peace Sign'), ('My Hero Academia', 'The Day'), ('Spy x Family', 'Mixed Nuts'), ('Hunter x Hunter', 'departure!'),
    ('Death Note', 'the WORLD'), ('Chainsaw Man', 'KICK BACK'), ('Oshi no Ko', 'Idol'), ('Jujutsu Kaisen', 'Kaikai Kitan'),
    ('Jujutsu Kaisen', 'SPECIALZ'), ('Demon Slayer', 'Gurenge'), ('Tokyo Ghoul', 'Unravel'), ('One Piece', 'We Are!'),
    # desenhos
    ('ThunderCats', 'Thundercats'), ('Pinky e o Cérebro', 'Pinky & The Brain'), ('Popeye', 'Popeye, o Marinheiro'),
    ('Charlie Brown', 'Linus And Lucy'), ('Bluey', 'Bluey Theme Tune'), ('Scooby-Doo', 'Scooby-Doo, Cadê Você'),
    ('Scooby-Doo', "What's New Scooby-Doo"), ('He-Man', 'He-Man'), ('Kim Possible', 'Call Me, Beep Me'),
    ('Inspetor Bugiganga', 'Inspector Gadget'), ('¡Mucha Lucha!', 'Mucha lucha'), ('Jovens Titãs', 'Teen Titans Theme'),
    ('Phineas e Ferb', 'Today is Gonna be a Great Day'), ('Steven Universo', 'We Are The Crystal Gems'),
    ('A Pantera Cor-de-Rosa', 'The Pink Panther Theme'), ('Arcane', 'Enemy'),
    # séries e novelas
    ('Brilhante Victoria', 'Make It Shine'), ('iCarly', 'Leave It All To Me'), ('Rebelde', 'Rebelde'), ('Dr. House', 'Teardrop'),
    ('Smallville', 'Save Me'), ('Peaky Blinders', 'Red Right Hand'), ('Narcos', 'Tuyo'), ('Um Maluco no Pedaço', 'The Fresh Prince'),
    ('Sítio do Picapau Amarelo', 'Sítio do Picapau Amarelo'), ('Missão: Impossível', 'Mission: Impossible'), ('Stranger Things', 'Stranger Things'),
    ('Game of Thrones', 'Main Title'), ('Friends', "I'll Be There for You"), ('Hannah Montana', 'The Best of Both Worlds'),
    ('Os Feiticeiros de Waverly Place', 'Everything is Not What it Seems'), ('The Office', 'The Office Theme'),
    ('Doctor Who', 'Doctor Who Theme'), ('How I Met Your Mother', 'Hey Beautiful'), ('Arquivo X', 'The X-Files Theme'),
    ('The Big Bang Theory', 'Big Bang Theory Theme'), ('Os Simpsons', 'The Simpsons Theme'), ('Breaking Bad', 'Breaking Bad Main Title'),
]
_LISTA = [(_n(o), _n(t)) for o, t in ABERTURAS]
_NOME = re.compile(r'abertura|opening|theme song|\(tema\)', re.I)
_TEMA = re.compile(r'\btheme\b|main title', re.I)
# tem "theme" no nome mas não é abertura
_NAO = re.compile(r'perry the platypus', re.I)


def e_abertura(m):
    # jogo não tem abertura no sentido de TV ("GTA San Andreas (Tema)" é trilha); Disney só se o nome disser
    if not m.get('obra') or m.get('categoria') == 'jogos' or m.get('categoria') == 'disney' and not _NOME.search(m.get('t', '')):
        return False
    t = m.get('t', '')
    if _NAO.search(t):
        return False
    if _NOME.search(t) or (m.get('categoria') == 'desenhos' and _TEMA.search(t)):
        return True
    o, tn = _n(m['obra']), _n(t)
    return any(o == lo and tn.startswith(lt) for lo, lt in _LISTA)
