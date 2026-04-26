from flask import Flask, render_template, request, jsonify, send_file
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import io
import base64
from datetime import datetime
import json
import os
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import cm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image as RLImage, HRFlowable
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT

app = Flask(__name__)

BARCODE_LOG_FILE = 'barcode_log.json'

def load_barcode_log():
    if os.path.exists(BARCODE_LOG_FILE):
        try:
            with open(BARCODE_LOG_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            return []
    return []

def save_barcode_log(log):
    with open(BARCODE_LOG_FILE, 'w', encoding='utf-8') as f:
        json.dump(log, f, ensure_ascii=False, indent=2)

def validate_ean13(barcode):
    # FIXED: was checking len == 26, correct is 13
    if len(barcode) != 13 or not barcode.isdigit():
        return False
    total = 0
    for i in range(12):
        total += int(barcode[i]) * (1 if i % 2 == 0 else 3)
    check_digit = (10 - (total % 10)) % 10
    return int(barcode[12]) == check_digit

def parse_barcode_norwegian(barcode):
    barcode = barcode.strip()

    # FIXED: correct EAN-13 is 13 digits, not 26
    if len(barcode) == 13 and barcode.isdigit():
        if validate_ean13(barcode):
            length_encoded = barcode[7:12]
            try:
                length_mm = int(length_encoded)
                length_cm = length_mm / 10.0
                if 50 < length_cm < 800:
                    return {
                        'valid': True,
                        'barcode': barcode,
                        'format': 'EAN-13',
                        'length_cm': round(length_cm, 1),
                        'producer': barcode[0:7],
                        'product_code': barcode[0:7],
                        'timestamp': datetime.now().isoformat()
                    }
            except ValueError:
                pass

    try:
        length = float(barcode)
        if 50 < length < 800:
            return {
                'valid': True,
                'barcode': barcode,
                'format': 'numeric',
                'length_cm': round(length, 1),
                'producer': 'manuell',
                'product_code': 'ukjent',
                'timestamp': datetime.now().isoformat()
            }
    except ValueError:
        pass

    if barcode.upper().startswith('L'):
        try:
            value = int(barcode[1:])
            length = value / 10.0
            if 50 < length < 800:
                return {
                    'valid': True,
                    'barcode': barcode,
                    'format': 'prefixed_L',
                    'length_cm': round(length, 1),
                    'producer': 'kodet',
                    'product_code': 'trelast',
                    'timestamp': datetime.now().isoformat()
                }
        except ValueError:
            pass

    return {'valid': False, 'barcode': barcode, 'error': 'Ukjent strekkodeformat'}


def solve_cutting_stock_ffd(wanted_lengths, measured_lengths, blade_width):
    sorted_lengths = sorted(wanted_lengths, reverse=True)
    stock_pool = sorted(measured_lengths, reverse=True)
    bins = []

    for length in sorted_lengths:
        placed = False
        for stock in bins:
            kerf = blade_width if stock['cuts'] else 0
            if stock['remaining_length'] >= length + kerf:
                stock['remaining_length'] -= (length + kerf)
                stock['cuts'].append(length)
                placed = True
                break

        if not placed:
            if not stock_pool:
                return {"error": "Ikke nok målte planker. Legg til flere målte lengder."}
            suitable = next((i for i, b in enumerate(stock_pool) if b >= length), None)
            if suitable is None:
                return {"error": f"Ingen planke er lang nok for kuttet {length} cm (lengste planke: {stock_pool[0]} cm)"}
            new_bin_length = stock_pool.pop(suitable)
            new_bin = {
                'cuts': [length],
                'remaining_length': new_bin_length - length,
                'original_length': new_bin_length
            }
            bins.append(new_bin)

    return bins


def suggest_optimal_lengths(wanted_lengths, blade_width):
    if not wanted_lengths:
        return []

    sorted_wanted = sorted(wanted_lengths, reverse=True)
    standard_lengths = [180, 210, 240, 270, 300, 330, 360, 390, 420, 450, 480, 510, 540, 570, 600]

    suggestions = []

    for std_len in standard_lengths:
        sim_bins = []
        for cut in sorted_wanted:
            placed = False
            for b in sim_bins:
                kerf = blade_width if b['cuts'] else 0
                if b['remaining'] >= cut + kerf:
                    b['remaining'] -= (cut + kerf)
                    b['cuts'].append(cut)
                    placed = True
                    break
            if not placed:
                if std_len >= cut:
                    sim_bins.append({'cuts': [cut], 'remaining': std_len - cut, 'original': std_len})

        if not sim_bins:
            continue

        total_placed = sum(len(b['cuts']) for b in sim_bins)
        if total_placed < len(sorted_wanted):
            continue

        num_boards = len(sim_bins)
        total_material = num_boards * std_len
        total_waste = sum(b['remaining'] for b in sim_bins)
        waste_pct = (total_waste / total_material * 100) if total_material > 0 else 100

        suggestions.append({
            'length_cm': std_len,
            'num_boards': num_boards,
            'total_material_cm': total_material,
            'total_waste_cm': round(total_waste, 1),
            'waste_pct': round(waste_pct, 1),
            'cuts_per_board': [b['cuts'] for b in sim_bins]
        })

    suggestions.sort(key=lambda x: (x['waste_pct'], x['num_boards']))
    return suggestions[:5]


def render_cut_image(stock, blade_width, index):
    fig, ax = plt.subplots(figsize=(10, 1.6))
    ax.set_xlim(0, stock['original_length'])
    ax.set_ylim(-0.6, 0.6)
    ax.set_yticks([])
    ax.set_xlabel("Lengde (cm)", fontsize=9)
    ax.set_title(f"Planke {index + 1}: {stock['original_length']:.1f} cm", fontsize=10, pad=4)

    x = 0
    cut_colors = ['#2196F3', '#1565C0', '#42A5F5', '#0D47A1', '#64B5F6']

    for ci, cut in enumerate(stock['cuts']):
        color = cut_colors[ci % len(cut_colors)]
        ax.broken_barh([(x, cut)], (-0.4, 0.8), facecolors=color, edgecolors='white', linewidth=1)
        if cut > stock['original_length'] * 0.05:
            ax.text(x + cut / 2, 0, f'{cut:.1f}', ha='center', va='center',
                    color='white', fontsize=8, fontweight='bold')
        x += cut

        # FIXED: sagblad kun mellom kutt, ikke etter siste kutt
        if ci < len(stock['cuts']) - 1:
            ax.broken_barh([(x, blade_width)], (-0.4, 0.8), facecolors='#424242', edgecolors='white', linewidth=0.5)
            x += blade_width

    if stock['remaining_length'] > 0:
        ax.broken_barh([(x, stock['remaining_length'])], (-0.4, 0.8),
                       facecolors='#EF5350', edgecolors='white', linewidth=1)
        if stock['remaining_length'] > stock['original_length'] * 0.03:
            ax.text(x + stock['remaining_length'] / 2, 0,
                    f"Avkapp\n{stock['remaining_length']:.1f}", ha='center', va='center',
                    color='white', fontsize=7)

    legend_elements = [
        mpatches.Patch(color='#2196F3', label='Kutt'),
        mpatches.Patch(color='#424242', label=f'Sagblad ({blade_width} cm)'),
        mpatches.Patch(color='#EF5350', label='Avkapp'),
    ]
    ax.legend(handles=legend_elements, loc='upper right', fontsize=7, framealpha=0.8)
    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)
    ax.spines['left'].set_visible(False)
    plt.tight_layout()

    buf = io.BytesIO()
    plt.savefig(buf, format='png', dpi=120, bbox_inches='tight')
    buf.seek(0)
    image_base64 = base64.b64encode(buf.read()).decode('utf-8')
    buf.close()
    plt.close(fig)
    return image_base64


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/parse_barcode', methods=['POST'])
def parse_barcode():
    data = request.get_json(silent=True)
    if not data:
        return jsonify({'error': 'Ugyldig eller manglende JSON'}), 400
    barcode = data.get('barcode', '').strip()
    if not barcode:
        return jsonify({'error': 'Strekkode er tom'}), 400
    result = parse_barcode_norwegian(barcode)
    if result.get('valid'):
        log = load_barcode_log()
        log.append(result)
        save_barcode_log(log)
    return jsonify(result)


@app.route('/get_barcode_history', methods=['GET'])
def get_barcode_history():
    return jsonify({'barcodes': load_barcode_log()})


@app.route('/suggest_lengths', methods=['POST'])
def suggest_lengths():
    data = request.get_json(silent=True)
    if not data:
        return jsonify({'error': 'Ugyldig JSON'}), 400
    wanted_lengths = data.get('wanted_lengths', [])
    blade_width = data.get('blade_width', 0.3)
    if not wanted_lengths:
        return jsonify({'error': 'Ingen ønskede lengder angitt'}), 400
    suggestions = suggest_optimal_lengths(wanted_lengths, blade_width)
    return jsonify({'suggestions': suggestions})


@app.route('/calculate_cuts', methods=['POST'])
def calculate_cuts():
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Ugyldig eller manglende JSON"}), 400

    wanted_lengths = data.get('wanted_lengths', [])
    measured_lengths = data.get('measured_lengths', [])
    blade_width = data.get('blade_width', 0.3)
    unit_price = data.get('unit_price', 0)

    total_wanted = sum(wanted_lengths)
    total_measured = sum(measured_lengths)

    if not wanted_lengths or not measured_lengths:
        return jsonify({"error": "Angi både ønskede og målte lengder.", "total_wanted": total_wanted}), 400
    if total_measured < total_wanted:
        return jsonify({
            "error": f"Totalt målte lengder ({total_measured:.1f} cm) er mindre enn ønskede lengder ({total_wanted:.1f} cm).",
            "total_wanted": total_wanted
        }), 400

    results = solve_cutting_stock_ffd(wanted_lengths, measured_lengths, blade_width)
    if isinstance(results, dict) and 'error' in results:
        return jsonify({"error": results['error'], "total_wanted": total_wanted}), 400

    # FIXED: correct waste calculation
    total_kerfs = sum(max(0, len(s['cuts']) - 1) for s in results) * blade_width
    total_used = sum(sum(s['cuts']) for s in results) + total_kerfs
    total_waste = total_measured - total_used
    total_price = unit_price * (total_measured / 100)
    waste_price = unit_price * (total_waste / 100)

    return jsonify({
        "results": results,
        "total_wanted": round(total_wanted, 2),
        "total_measured": round(total_measured, 2),
        "total_used": round(total_used, 2),
        "total_waste": round(total_waste, 2),
        "total_price": round(total_price, 2),
        "waste_price": round(waste_price, 2)
    })


@app.route('/visualize_cuts', methods=['POST'])
def visualize_cuts():
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Ugyldig eller manglende JSON"}), 400
    results = data.get('results', [])
    blade_width = data.get('blade_width', 0.3)
    images = [render_cut_image(stock, blade_width, i) for i, stock in enumerate(results)]
    return jsonify({"images": images})


@app.route('/export_pdf', methods=['POST'])
def export_pdf():
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Ugyldig JSON"}), 400

    results = data.get('results', [])
    blade_width = data.get('blade_width', 0.3)
    unit_price = data.get('unit_price', 0)
    total_wanted = data.get('total_wanted', 0)
    total_measured = data.get('total_measured', 0)
    total_used = data.get('total_used', 0)
    total_waste = data.get('total_waste', 0)
    total_price = data.get('total_price', 0)
    waste_price = data.get('waste_price', 0)

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4,
                            leftMargin=2*cm, rightMargin=2*cm,
                            topMargin=2*cm, bottomMargin=2*cm)

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle('Title', parent=styles['Title'],
                                  fontSize=20, textColor=colors.HexColor('#1565C0'), spaceAfter=6)
    heading_style = ParagraphStyle('Heading', parent=styles['Heading2'],
                                    fontSize=13, textColor=colors.HexColor('#1565C0'),
                                    spaceBefore=12, spaceAfter=4)
    small_style = ParagraphStyle('Small', parent=styles['Normal'], fontSize=9, textColor=colors.grey)

    story = []
    story.append(Paragraph("Plankeplukker'n – Kuttplan", title_style))
    story.append(Paragraph(f"Generert: {datetime.now().strftime('%d.%m.%Y %H:%M')}", small_style))
    story.append(HRFlowable(width="100%", thickness=2, color=colors.HexColor('#1565C0'), spaceAfter=12))

    story.append(Paragraph("Oppsummering", heading_style))
    summary_data = [
        ['Parameter', 'Verdi'],
        ['Sagbladbredde', f'{blade_width} cm'],
        ['Meterpris', f'kr {unit_price:.2f}'],
        ['Total oensket lengde', f'{total_wanted:.1f} cm  ({total_wanted/100:.2f} m)'],
        ['Total maalt lengde', f'{total_measured:.1f} cm  ({total_measured/100:.2f} m)'],
        ['Total brukt (kutt + sagblad)', f'{total_used:.1f} cm  ({total_used/100:.2f} m)'],
        ['Avkapp/Svinn', f'{total_waste:.1f} cm  ({total_waste/100:.2f} m)'],
        ['Estimert totalpris', f'kr {total_price:.2f}'],
        ['Pris for svinn', f'kr {waste_price:.2f}'],
        ['Antall planker brukt', str(len(results))],
    ]

    summary_table = Table(summary_data, colWidths=[8*cm, 8*cm])
    summary_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1565C0')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#E3F2FD')]),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#BBDEFB')),
        ('FONTNAME', (0, 1), (0, -1), 'Helvetica-Bold'),
        ('PADDING', (0, 0), (-1, -1), 7),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    story.append(summary_table)
    story.append(Spacer(1, 0.5*cm))

    story.append(Paragraph("Detaljer per planke", heading_style))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#BBDEFB'), spaceAfter=8))

    for i, stock in enumerate(results):
        story.append(Paragraph(f"Planke {i+1}  -  Maalt lengde: {stock['original_length']:.1f} cm", heading_style))

        num_kerfs = max(0, len(stock['cuts']) - 1)
        used_for_cuts = sum(stock['cuts'])

        board_data = [
            ['Kuttlengder', ', '.join(f"{c:.1f} cm" for c in stock['cuts'])],
            ['Antall kutt', str(len(stock['cuts']))],
            ['Sagblad-kutt', str(num_kerfs)],
            ['Material til kutt', f'{used_for_cuts:.1f} cm'],
            ['Material til sagblad', f'{num_kerfs * blade_width:.2f} cm'],
            ['Avkapp', f'{stock["remaining_length"]:.1f} cm'],
        ]
        board_table = Table(board_data, colWidths=[7*cm, 9*cm])
        board_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#E3F2FD')),
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#BBDEFB')),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('PADDING', (0, 0), (-1, -1), 6),
            ('ROWBACKGROUNDS', (1, 0), (-1, -1), [colors.white, colors.HexColor('#F5F5F5')]),
        ]))
        story.append(board_table)

        img_b64 = render_cut_image(stock, blade_width, i)
        img_bytes = base64.b64decode(img_b64)
        img_buf = io.BytesIO(img_bytes)
        rl_img = RLImage(img_buf, width=16*cm, height=2.6*cm)
        story.append(Spacer(1, 0.3*cm))
        story.append(rl_img)
        story.append(Spacer(1, 0.4*cm))
        story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor('#BBDEFB'), spaceAfter=4))

    doc.build(story)
    buf.seek(0)

    filename = f"kuttplan_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
    return send_file(buf, as_attachment=True, download_name=filename, mimetype='application/pdf')


if __name__ == '__main__':
    app.run(debug=True, port=5000)
