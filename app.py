from flask import Flask, render_template, request, jsonify
app = Flask(__name__)

def solve_cutting_stock_ffd(wanted_lengths, measured_lengths, blade_width):
    wanted_lengths.sort(reverse=True)
    bins = []
    for length in wanted_lengths:
        placed = False
        for bin in bins:
            if bin['remaining_length'] >= length + blade_width:
                bin['cuts'].append(length)
                bin['remaining_length'] -= (length + blade_width)
                placed = True
                break
        if not placed:
            new_bin = {
                'cuts': [length],
                'remaining_length': max(measured_lengths) - length - blade_width,
                'original_length': max(measured_lengths)
            }
            bins.append(new_bin)
    return bins

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/calculate_cuts', methods=['POST'])
def calculate_cuts():
    data = request.json
    wanted_lengths = data.get('wanted_lengths', [])
    measured_lengths = data.get('measured_lengths', [])
    blade_width = data.get('blade_width', 0)
    if not wanted_lengths or not measured_lengths:
        return jsonify({"error": "Please provide both wanted lengths and measured lengths."}), 400
    if sum(measured_lengths) < sum(wanted_lengths):
        return jsonify({"error": "Total measured stock is less than total wanted lengths. Add more stock."}), 400
    results = solve_cutting_stock_ffd(wanted_lengths, measured_lengths, blade_width)
    return jsonify(results)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8080, debug=True)
