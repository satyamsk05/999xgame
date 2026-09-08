from pathlib import Path
import subprocess

# Login verification: permanent auth failures must stop, not silently retry.
p = Path('lib/screens/login_screen.dart')
lines = p.read_text().splitlines()
i = next(i for i, l in enumerate(lines) if "debugPrint('[LoginVerify] Error in verification loop: $e');" in l)
start, end = i - 1, i + 2
indent = lines[start].split('}')[0]
lines[start:end + 1] = [
    indent + '} catch (e) {',
    indent + '  if (e is ApiException) {',
    indent + '    const retryableStatuses = <int>{0, 408, 429, 500, 502, 503, 504};',
    indent + '    final status = e.statusCode ?? 0;',
    indent + '    if (!retryableStatuses.contains(status)) {',
    indent + '      _isVerifyingActive = false;',
    indent + '      if (mounted) {',
    indent + '        setState(() {',
    indent + '          _isLoading = false;',
    indent + '          _statusMessage = null;',
    indent + '          _errorMessage = e.message;',
    indent + '          _currentStep = 0;',
    indent + '        });',
    indent + '      }',
    indent + '      return;',
    indent + '    }',
    indent + '  }',
    indent + "  debugPrint('[LoginVerify] transient error: $e');",
    indent + '  await Future.delayed(const Duration(milliseconds: 1500));',
    indent + '}',
]
i = next(i for i, l in enumerate(lines) if '// Non-fatal: proceed even if API call fails' in l)
start, end = i - 1, i + 2
indent = lines[start].split('}')[0]
lines[start:end + 1] = [
    indent + '} catch (e) {',
    indent + '  if (mounted) {',
    indent + '    setState(() {',
    indent + '      _isLoading = false;',
    indent + "      _errorMessage = e is ApiException ? e.message : 'Could not complete setup. Please try again.';",
    indent + '    });',
    indent + '  }',
    indent + '  return;',
    indent + '}',
    '',
]
p.write_text('\n'.join(lines) + '\n')

# Backend readiness is the network signal; avoid DNS checks against third parties.
p = Path('lib/main.dart')
lines = [l for l in p.read_text().splitlines() if l != "import 'dart:io';"]
start = next(i for i, l in enumerate(lines) if l.startswith('  void _startNetworkMonitoring()'))
end = next(i for i, l in enumerate(lines[start:], start) if l.startswith('  Future<void> _fetchUserData'))
monitor = '''  void _startNetworkMonitoring() {
    _networkPingTimer?.cancel();
    _networkPingTimer = Timer.periodic(const Duration(seconds: 8), (timer) async {
      if (!mounted || !_isLoggedIn) return;
      final ready = await ApiService.isBackendReady(timeout: const Duration(seconds: 4));
      if (!mounted) return;
      if (ready) {
        if (_isOffline) {
          setState(() => _isOffline = false);
          _fetchUserData();
        }
      } else if (!_isOffline) {
        setState(() => _isOffline = true);
      }
    });
  }
'''.splitlines()
lines[start:end] = monitor
p.write_text('\n'.join(lines) + '\n')

# Integer paise value object for financial boundaries.
p = Path('lib/core/money/money_paise.dart')
p.parent.mkdir(parents=True, exist_ok=True)
p.write_text('''/// Exact monetary value represented as integer paise.
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
''')

# Typed API entry points; legacy double methods remain compatible.
p = Path('lib/features/wallet/data/wallet_api.dart')
s = p.read_text()
if 'money_paise.dart' not in s:
    s = s.replace("import '../../../core/api/api_client.dart';", "import '../../../core/api/api_client.dart';\nimport '../../../core/money/money_paise.dart';", 1)
if 'createDepositOrderPaise' not in s:
    typed = '''\n  static Future<Map<String, dynamic>> createDepositOrderPaise({required MoneyPaise amount, String paymentMethod = 'UPI'}) async {
    final res = await ApiClient.post('/deposits', {'amount': amount.rupees, 'amountPaise': amount.value, 'paymentMethod': paymentMethod});
    return res as Map<String, dynamic>;
  }

  static Future<Map<String, dynamic>> withdrawCashPaise({required MoneyPaise amount, required String upiId, String? idempotencyKey}) async {
    final res = await ApiClient.post('/withdrawals', {'amount': amount.rupees, 'amountPaise': amount.value, 'upiId': upiId, 'idempotencyKey': idempotencyKey});
    return res as Map<String, dynamic>;
  }
'''
    s = s.replace('class WalletApi {', 'class WalletApi {' + typed, 1)
p.write_text(s)

# Remove temporary one-shot workflows.
for path in [
    '.github/workflows/complete-audit-fix.yml',
    '.github/workflows/apply-audit-fixes.yml',
    '.github/workflows/finalize-audit-fixes.yml',
    '.github/workflows/finish-audit.yml',
]:
    Path(path).unlink(missing_ok=True)

subprocess.run(['git', 'config', 'user.name', 'github-actions[bot]'], check=True)
subprocess.run(['git', 'config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com'], check=True)
subprocess.run(['git', 'add', 'lib'], check=True)
subprocess.run(['git', 'add', '-u', '.github/workflows'], check=True)
subprocess.run(['git', 'commit', '-m', 'chore: apply remaining audit fixes'], check=False)
subprocess.run(['git', 'push'], check=True)
