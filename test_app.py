import pytest
import json
from app import app, validate_ean13, parse_barcode_norwegian, solve_cutting_stock_ffd
from datetime import datetime


@pytest.fixture
def client():
    """Flask test client"""
    app.config['TESTING'] = True
    with app.test_client() as client:
        yield client


class TestValidateEAN13:
    """Tests for EAN-13 barcode validation"""
    
    def test_valid_ean13(self):
        """Test valid EAN-13 barcode"""
        # Valid EAN-13: 4006381333931
        # Check digit calculation: 4+0+6+8+3+3+9 = 33, 3+3+3 = 9
        # (1+0+6+3+3+3+3) * 3 = 57, 33 + 57 = 90, (10 - 0) % 10 = 0
        assert validate_ean13('4006381333931') == True
    
    def test_invalid_ean13_wrong_checksum(self):
        """Test EAN-13 with wrong checksum"""
        assert validate_ean13('4006381333930') == False
    
    def test_invalid_ean13_wrong_length(self):
        """Test barcode with wrong length"""
        assert validate_ean13('400638133393') == False  # 12 digits
        assert validate_ean13('40063813339311') == False  # 14 digits
    
    def test_invalid_ean13_non_numeric(self):
        """Test barcode with non-numeric characters"""
        assert validate_ean13('400638133393A') == False
        assert validate_ean13('40063813339 1') == False
    
    def test_invalid_ean13_empty(self):
        """Test empty barcode"""
        assert validate_ean13('') == False


class TestParseBarcode:
    """Tests for Norwegian barcode parsing"""
    
    def test_parse_numeric_format(self):
        """Test parsing simple numeric format (length in cm)"""
        result = parse_barcode_norwegian('210')
        assert result['valid'] == True
        assert result['format'] == 'numeric'
        assert result['length_cm'] == 210.0
        assert result['producer'] == 'manual_entry'
    
    def test_parse_numeric_below_min(self):
        """Test numeric format below minimum range"""
        result = parse_barcode_norwegian('30')
        assert result['valid'] == False
        assert 'error' in result
    
    def test_parse_numeric_above_max(self):
        """Test numeric format above maximum range"""
        result = parse_barcode_norwegian('900')
        assert result['valid'] == False
        assert 'error' in result
    
    def test_parse_prefixed_format(self):
        """Test L-prefixed format"""
        result = parse_barcode_norwegian('L2100')
        assert result['valid'] == True
        assert result['format'] == 'prefixed_L'
        assert result['length_cm'] == 210.0
    
    def test_parse_prefixed_lowercase(self):
        """Test l-prefixed format (lowercase)"""
        result = parse_barcode_norwegian('l2100')
        assert result['valid'] == True
        assert result['format'] == 'prefixed_L'
        assert result['length_cm'] == 210.0
    
    def test_parse_whitespace_trimming(self):
        """Test that whitespace is trimmed"""
        result = parse_barcode_norwegian('  210  ')
        assert result['valid'] == True
        assert result['length_cm'] == 210.0
    
    def test_parse_invalid_format(self):
        """Test invalid barcode format"""
        result = parse_barcode_norwegian('ABC123XYZ')
        assert result['valid'] == False
        assert result['error'] == 'Ukjent strekkodeformat'
    
    def test_parse_boundary_min_length(self):
        """Test boundary: just above minimum"""
        result = parse_barcode_norwegian('51')
        assert result['valid'] == True
        assert result['length_cm'] == 51.0
    
    def test_parse_boundary_max_length(self):
        """Test boundary: just below maximum"""
        result = parse_barcode_norwegian('799')
        assert result['valid'] == True
        assert result['length_cm'] == 799.0


class TestSolveCuttingStock:
    """Tests for cutting stock problem solver"""
    
    def test_simple_cutting_problem(self):
        """Test basic cutting problem"""
        wanted = [100, 50]
        measured = [200]
        result = solve_cutting_stock_ffd(wanted, measured, blade_width=0)
        
        assert isinstance(result, list)
        assert len(result) == 1
        assert result[0]['original_length'] == 200
        assert result[0]['remaining_length'] == 50
        assert 100 in result[0]['cuts']
        assert 50 in result[0]['cuts']
    
    def test_cutting_with_blade_width(self):
        """Test cutting with blade width"""
        wanted = [100, 100]
        measured = [210]
        blade_width = 5
        result = solve_cutting_stock_ffd(wanted, measured, blade_width)
        
        assert len(result) == 1
        # 100 + 5 (blade) + 100 = 205, remaining = 5
        assert result[0]['remaining_length'] == 5
    
    def test_multiple_stock_pieces(self):
        """Test problem requiring multiple stock pieces"""
        wanted = [150, 150, 150]
        measured = [200, 200]
        result = solve_cutting_stock_ffd(wanted, measured, blade_width=0)
        
        assert len(result) == 2
        total_cuts = sum(len(stock['cuts']) for stock in result)
        assert total_cuts == 3
    
    def test_insufficient_stock(self):
        """Test when stock is too short"""
        wanted = [300]
        measured = [200]
        result = solve_cutting_stock_ffd(wanted, measured, blade_width=0)
        
        assert isinstance(result, dict)
        assert 'error' in result
    
    def test_no_stock_available(self):
        """Test when no stock pieces available"""
        wanted = [100, 100, 100]
        measured = [200]
        result = solve_cutting_stock_ffd(wanted, measured, blade_width=0)
        
        assert isinstance(result, dict)
        assert 'error' in result
        assert 'flere målte lengder' in result['error']
    
    def test_exact_fit(self):
        """Test when cuts fit exactly"""
        wanted = [100, 100]
        measured = [200]
        result = solve_cutting_stock_ffd(wanted, measured, blade_width=0)
        
        assert len(result) == 1
        assert result[0]['remaining_length'] == 0
    
    def test_ffd_algorithm_ordering(self):
        """Test FFD (First Fit Decreasing) ordering"""
        wanted = [50, 100, 75]  # Will be sorted to [100, 75, 50]
        measured = [175, 100]
        result = solve_cutting_stock_ffd(wanted, measured, blade_width=0)
        
        # First stock: 100 + 75 = 175 (0 remaining)
        # Second stock: 50 (50 remaining)
        assert len(result) == 2


class TestFlaskRoutes:
    """Tests for Flask API routes"""
    
    def test_index_route(self, client):
        """Test index route returns HTML"""
        response = client.get('/')
        assert response.status_code == 200
        assert b'Plankeplukker' in response.data or b'<!DOCTYPE html>' in response.data
    
    def test_parse_barcode_route_valid(self, client):
        """Test parse_barcode endpoint with valid barcode"""
        response = client.post('/parse_barcode',
                              json={'barcode': '210'},
                              content_type='application/json')
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['valid'] == True
        assert data['length_cm'] == 210.0
    
    def test_parse_barcode_route_invalid(self, client):
        """Test parse_barcode endpoint with invalid barcode"""
        response = client.post('/parse_barcode',
                              json={'barcode': 'INVALID'},
                              content_type='application/json')
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['valid'] == False
    
    def test_parse_barcode_route_missing_data(self, client):
        """Test parse_barcode endpoint without JSON"""
        response = client.post('/parse_barcode',
                              json={})
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['valid'] == False
    
    def test_parse_barcode_route_no_json(self, client):
        """Test parse_barcode endpoint with no JSON at all"""
        response = client.post('/parse_barcode')
        assert response.status_code == 400
    
    def test_calculate_cuts_route_valid(self, client):
        """Test calculate_cuts endpoint"""
        response = client.post('/calculate_cuts',
                              json={
                                  'wanted_lengths': [100, 50],
                                  'measured_lengths': [200],
                                  'blade_width': 0,
                                  'unit_price': 19.95
                              },
                              content_type='application/json')
        assert response.status_code == 200
        data = json.loads(response.data)
        assert 'results' in data
        assert data['total_wanted'] == 150
        assert data['total_measured'] == 200
    
    def test_calculate_cuts_route_insufficient_stock(self, client):
        """Test calculate_cuts with insufficient stock"""
        response = client.post('/calculate_cuts',
                              json={
                                  'wanted_lengths': [300],
                                  'measured_lengths': [200],
                                  'blade_width': 0,
                                  'unit_price': 19.95
                              },
                              content_type='application/json')
        assert response.status_code == 400
        data = json.loads(response.data)
        assert 'error' in data
    
    def test_calculate_cuts_route_missing_fields(self, client):
        """Test calculate_cuts with missing fields"""
        response = client.post('/calculate_cuts',
                              json={
                                  'wanted_lengths': [100]
                              },
                              content_type='application/json')
        assert response.status_code == 400
        data = json.loads(response.data)
        assert 'error' in data
    
    def test_get_barcode_history(self, client):
        """Test get_barcode_history endpoint"""
        response = client.get('/get_barcode_history')
        assert response.status_code == 200
        data = json.loads(response.data)
        assert 'barcodes' in data
        assert isinstance(data['barcodes'], list)
    
    def test_visualize_cuts_route(self, client):
        """Test visualize_cuts endpoint"""
        cuts_data = {
            'results': [
                {
                    'original_length': 200,
                    'cuts': [100, 50],
                    'remaining_length': 50
                }
            ],
            'blade_width': 0
        }
        response = client.post('/visualize_cuts',
                              json=cuts_data,
                              content_type='application/json')
        assert response.status_code == 200
        data = json.loads(response.data)
        assert 'images' in data
        assert len(data['images']) > 0


class TestEdgeCases:
    """Tests for edge cases and boundary conditions"""
    
    def test_float_precision_lengths(self):
        """Test with floating point lengths"""
        wanted = [100.5, 99.5]
        measured = [200]
        result = solve_cutting_stock_ffd(wanted, measured, blade_width=0)
        assert result[0]['remaining_length'] == 0.0
    
    def test_large_quantities(self):
        """Test with large number of cuts"""
        wanted = [50] * 100  # 100 pieces of 50cm
        measured = [2000, 2000, 2000]  # 3 pieces of 2m
        result = solve_cutting_stock_ffd(wanted, measured, blade_width=0)
        
        total_cuts = sum(len(stock['cuts']) for stock in result)
        assert total_cuts == 100
    
    def test_single_length_multiple_quantities(self):
        """Test repeated same length"""
        wanted = [200] * 5
        measured = [1000]
        result = solve_cutting_stock_ffd(wanted, measured, blade_width=0)
        
        assert len(result) == 1
        assert len(result[0]['cuts']) == 5


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
