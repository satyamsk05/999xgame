/// Exact monetary value represented as integer paise.
class MoneyPaise {
  const MoneyPaise(this.value);
  final int value;
  factory MoneyPaise.fromRupees(num rupees) {
    if (!rupees.isFinite || rupees < 0) throw ArgumentError.value(rupees, 'rupees');
    final scaled = rupees * 100;
    if (scaled.roundToDouble() != scaled) throw ArgumentError.value(rupees, 'rupees', 'at most two decimal places');
    return MoneyPaise(scaled.toInt());
  }
  double get rupees => value / 100.0;
  String get decimalString => (value / 100).toStringAsFixed(2);
  Map<String, dynamic> toJson() => {'amountPaise': value};
  @override bool operator ==(Object other) => other is MoneyPaise && other.value == value;
  @override int get hashCode => value.hashCode;
}
