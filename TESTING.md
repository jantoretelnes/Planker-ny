# Testing Guide for Planker-ny

## Installasjon

1. Installer dependencies:
```bash
pip install -r requirements.txt
```

## Kjøre tester

### Kjør alle tester:
```bash
pytest
```

### Kjør spesifike testklasser:
```bash
pytest test_app.py::TestValidateEAN13 -v
pytest test_app.py::TestParseBarcode -v
pytest test_app.py::TestSolveCuttingStock -v
pytest test_app.py::TestFlaskRoutes -v
```

### Kjør spesifikk test:
```bash
pytest test_app.py::TestValidateEAN13::test_valid_ean13 -v
```

### Kjør med coverage rapport:
```bash
pip install pytest-cov
pytest --cov=app --cov-report=html
```

## Testsett beskrivelse

### TestValidateEAN13
- Tester validering av EAN-13 strekkkoder
- Dekker gyldig strekkode, feil checksumme, feil lengde, ikke-numeriske tegn

### TestParseBarcode
- Tester parsing av norske strekkoder for trelast
- Tester tre format: numerisk, L-prefiks, og EAN-13
- Dekker grenseverdier (min/max lengde)
- Tester håndtering av whitespace

### TestSolveCuttingStock
- Tester skjæreoptimeringsalgoritme (FFD - First Fit Decreasing)
- Tester enkle og komplekse saksesituasjoner
- Tester håndtering av kuttbredde (bladets tykkelse)
- Tester feil ved utilstrekkelig materiale

### TestFlaskRoutes
- Tester alle API-endepunkter
- Tester gyldig og ugyldig input
- Tester feilhåndtering
- Tester visualisering av kutt

### TestEdgeCases
- Tester randsituasjoner og grenseverdier
- Tester med store mengder
- Tester presisjon med desimaltall

## Testdekning

Testene dekker:
- ✅ EAN-13 validering
- ✅ Strekkodeparsing (3 format)
- ✅ Skjæreoptimeringsalgoritme
- ✅ Flask API-endepunkter
- ✅ Feilhåndtering
- ✅ Grenseverdier
- ✅ Visualisering

## Eksempler

```bash
# Kjør alle tester med verbose output
pytest -v

# Kjør tester for kun EAN-13 validering
pytest test_app.py::TestValidateEAN13 -v

# Kjør med coverage rapport
pytest --cov=app

# Kjør specific test
pytest test_app.py::TestSolveCuttingStock::test_simple_cutting_problem -v
```
