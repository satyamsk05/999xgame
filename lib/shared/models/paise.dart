/// Exact integer money representation used at API boundaries.
///
/// One rupee is exactly 100 paise. Keeping the canonical value as an int
/// avoids floating-point rounding errors in wallet and betting flows.
class Paise {
  final int value;

  const Paise(this.value);

  factory Paise.fromRupees(num rupees) {
    if (!rupees.isFinite || rupees < 0) {
      throw ArgumentError.value(rupees, 'rupees', 'must be finite and non-negative');
    }
    return Paise((rupees * 100).round());
  }

  factory Paise.fromJson(Object? value) {
    if (value is int) return Paise(value);
    if (value is num) return Paise.fromRupees(value);
    if (value is String) return Paise.fromRupees(num.parse(value));
    throw FormatException('Invalid monetary value: $value');
  }

  double get rupees => value / 100.0;

  String get formatted => '₹${(value / 100).toStringAsFixed(2)}';

  Paise operator +(Paise other) => Paise(value + other.value);
  Paise operator -(Paise other) => Paise(value - other.value);

  bool operator <(Paise other) => value < other.value;
  bool operator <=(Paise other) => value <= other.value;
  bool operator >(Paise other) => value > other.value;
  bool operator >=(Paise other) => value >= other.value;

  @override
  bool operator ==(Object other) => other is Paise && other.value == value;

  @override
  int get hashCode => value.hashCode;

  @override
  String toString() => 'Paise($value)';
}

class WalletBalance {
  final Paise total;
  final Paise deposit;
  final Paise winning;

  const WalletBalance({
    required this.total,
    required this.deposit,
    required this.winning,
  });

  factory WalletBalance.fromJson(Map<String, dynamic> json) {
    Paise read(String key) => Paise.fromJson(json[key] ?? 0);
    return WalletBalance(
      total: read('balance'),
      deposit: read('depositBalance'),
      winning: read('winningBalance'),
    );
  }
}
