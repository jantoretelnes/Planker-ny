# Plankeplukker'n - Strekkodeskanning for Trelast

## Oversikt

Dette programmet implementerer strekkodeskanning for trelast med variabel lengde, i henhold til norsk byggevarestandard for identifisering og merking av byggevarer.

## Nødvendige biblioteker

### Python (Backend)
| Bibliotek | Versjon | Formål |
|-----------|---------|--------|
| **Flask** | 2.0+ | Webserverframework |
| **matplotlib** | 3.5+ | Visualisering av kutt-plan som grafikk |
| **io** | Standard | In-memory filer for bildebuffering |
| **base64** | Standard | Koding av bilder til base64 for HTML |
| **datetime** | Standard | Tidsstempel for logginger |
| **json** | Standard | JSON-håndtering for API |

### JavaScript (Frontend)
| Bibliotek | Versjon | Formål |
|-----------|---------|--------|
| **html5-qrcode** | 2.3.4 | Strekkode- og QR-kodeskanning via kamera |

### Installasjon av Python-avhengigheter

```bash
pip install Flask matplotlib
```

Eller bruk requirements.txt:

```bash
pip install -r requirements.txt
```

**requirements.txt:**
```
Flask==2.3.0
matplotlib==3.7.0
```

### CDN-ressurser (automatisk lastet)

html5-qrcode lastes fra CDN og krever ingen lokal installasjon:
```html
<script src="https://unpkg.com/html5-qrcode@2.3.4/dist/html5-qrcode.min.js"></script>
```

## Strekkodeformat som støttes

Programmet støtter flere strekkodeformat for målte lengder:

### 1. EAN-13 Format (Standard)
**Beskrivelse:** 13-sifret strekkode som følger EAN-standarden

**Format:** `PPPPPLLLLLLCCC`
- PPP = Produsentkode (3 sifre)
- PP = Produkttype (2 sifre)  
- LLLLL = Lengdedata (5 sifre, dividert på 10 for cm)
- CCC = Kontrollsiffer (3 sifre)

**Eksempel:** `9876543210012` (210.0 cm)

**Validering:** Kontrollsifferet valideres automatisk

### 2. Enkelt numerisk format
**Beskrivelse:** Bare lengden i centimeter

**Format:** `LLLL.L`
- Direkte lengde i cm

**Eksempel:** `210.5` = 210.5 cm

### 3. Prefikset L-format
**Beskrivelse:** L-prefiks etterfulgt av lengde i millimeter (dividert på 10)

**Format:** `LMMMMM`
- L = Prefikstegn
- MMMMM = Lengde i mm/10 (= cm)

**Eksempel:** `L2100` = 210.0 cm

## Bruk av strekkodeskanning

### Skanneropsett
1. Bruk en strekkodeleser som fungerer som tastaturinput
2. Fokuser på strekkodefeltet merket "Skann strekkode her..."
3. Skann strekkoden på trelastet
4. Lengden legges automatisk til listen over målte lengder

### Trinn-for-trinn
1. **Plasser strekkodeleser:** Sørg for at strekkodeleseren er koblet til og kalibrert
2. **Fokuser input-felt:** Klikk på strekkodefeltet øverst i programmet
3. **Skann strekkode:** Skann strekkoden på trelastet
4. **Bekreft:** Lengden vises straks i strekkodehistorikken og legges til målte lengder
5. **Gjenta:** Skann flere trelaster etter behov
6. **Fjern:** Bruk "Fjern"-knappen for å fjerne enkeltskann eller "Tøm" for å slette alt

### Strekkodehistorikk
Programmet viser:
- Skannet lengde i cm
- Dato og tidspunkt for skanning
- Produsentkode
- Strekkodeverdi

## Norsk Byggevarestandard

Implementeringen følger standardene for:
- **Identifisering av byggevarer** (Virke-standarden)
- **Trelast - variabel lengde**
- **Merking og sporing av materialer**

### Standard-elementer implementert:
- EAN-13 barcode-validering
- Lengdekodering i henhold til standard
- Sporing av skannet materiale med tidsstempel
- Dokumentasjon av lengdedata for hver strekkode

## Teknisk implementering

### Frontend (JavaScript)
- Automatisk gjenkjenning av strekkodeformat
- Real-time validering
- Visuell feedback for skanninger

### Backend (Python/Flask)
- EAN-13 checksum-validering
- Strekkode-parsing etter norsk standard
- Historikk-logging av alle skannede barcodes
- Endpoint: `/parse_barcode` for validering
- Endpoint: `/get_barcode_history` for historikk

## Eksempler

### Eksempel 1: Skanning av standard trelast
```
Strekkode: 9876543210012
↓
Tolket som: 210.0 cm (21.0 m)
Legges til målte lengder
```

### Eksempel 2: Manuell lengdeinput
```
Strekkode: 245.5
↓
Tolket som: 245.5 cm (2.455 m)
```

### Eksempel 3: Kodet format
```
Strekkode: L2100
↓
Tolket som: 210.0 cm (21.0 m)
```

## Feilsøking

### Strekkoden godtas ikke
- Kontroller at strekkoden har riktig format
- Sjekk at lengdeverdien er mellom 10-1000 cm
- For EAN-13: Bekreft at kontrollsifferet er korrekt

### Lengde vises ikke
- Kontroller at strekkodeleseren er koblet til
- Sjekk at inndatafelt er fokusert
- Prøv å taste lengden manuelt hvis leser ikke fungerer

## Kobling til skjæreoptimalisering

Alle skannet lengder legges automatisk til "Målte lengder"-listen og brukes i:
- Skjæreplanen
- Optimalisering av kutt
- Kostnadsberegning
- Visualisering av kutt

## Lagring og eksport

Strekkodehistorikken lagres i programmet og kan hentes via:
- API: `GET /get_barcode_history`

Historikken inkluderer:
- Alle skannet strekkoder
- Tolket lengde for hver strekkode
- Skanningtidspunkt
- Produsentkode fra EAN-13
