import 'package:url_launcher/url_launcher.dart';
import '../../../core/api/api_client.dart';
import '../../../core/money/money_paise.dart';

class WalletApi {
  static Future<Map<String, dynamic>> createDepositOrderPaise({required MoneyPaise amount, String paymentMethod = 'UPI'}) async {
    final res = await ApiClient.post('/deposits', {
      'amount': amount.rupees,
      'amountPaise': amount.value,
      'paymentMethod': paymentMethod,
    });
    final data = res as Map<String, dynamic>;
    final order = data['data'];
    if (order is Map && order['paymentUrl'] is String && (order['paymentUrl'] as String).isNotEmpty) {
      final uri = Uri.tryParse(order['paymentUrl'] as String);
      if (uri != null) await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
    return data;
  }

  static Future<Map<String, dynamic>> withdrawCashPaise({required MoneyPaise amount, required String upiId, String? idempotencyKey}) async {
    final res = await ApiClient.post('/withdrawals', {
      'amount': amount.rupees,
      'amountPaise': amount.value,
      'upiId': upiId,
      'idempotencyKey': idempotencyKey,
    });
    return res as Map<String, dynamic>;
  }

  static Future<Map<String, dynamic>> getUserProfile() async {
    final res = await ApiClient.get('/user/profile');
    return res as Map<String, dynamic>;
  }

  static Future<Map<String, dynamic>> createDepositOrder({required double amount, String paymentMethod = 'UPI'}) {
    return createDepositOrderPaise(amount: MoneyPaise.fromRupees(amount), paymentMethod: paymentMethod);
  }

  static Future<Map<String, dynamic>> submitUtr({required String depositId, required String utr}) async {
    final res = await ApiClient.post('/deposits/$depositId/utr', {'utr': utr});
    return res as Map<String, dynamic>;
  }

  static Future<Map<String, dynamic>> withdrawCash({required double amount, required String upiId, String? idempotencyKey}) {
    return withdrawCashPaise(amount: MoneyPaise.fromRupees(amount), upiId: upiId, idempotencyKey: idempotencyKey);
  }

  static Future<Map<String, dynamic>> getTransactions({int page = 1, int limit = 20}) async {
    final res = await ApiClient.get('/wallet/transactions?page=$page&limit=$limit');
    return res as Map<String, dynamic>;
  }
}