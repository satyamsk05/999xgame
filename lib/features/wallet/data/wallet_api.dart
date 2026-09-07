import '../../../core/api/api_client.dart';

class WalletApi {
  static Future<Map<String, dynamic>> getUserProfile() async {
    final res = await ApiClient.get('/user/profile');
    return res as Map<String, dynamic>;
  }

  static Future<Map<String, dynamic>> createDepositOrder({
    required double amount,
    String paymentMethod = 'UPI',
  }) async {
    final res = await ApiClient.post('/deposits', {
      'amount': amount,
      'paymentMethod': paymentMethod,
    });
    return res as Map<String, dynamic>;
  }

  static Future<Map<String, dynamic>> submitUtr({
    required String depositId,
    required String utr,
  }) async {
    final res = await ApiClient.post('/deposits/$depositId/utr', {
      'utr': utr,
    });
    return res as Map<String, dynamic>;
  }

  static Future<Map<String, dynamic>> withdrawCash({
    required double amount,
    required String upiId,
    String? idempotencyKey,
  }) async {
    final res = await ApiClient.post('/withdrawals', {
      'amount': amount,
      'upiId': upiId,
      'idempotencyKey': idempotencyKey,
    });
    return res as Map<String, dynamic>;
  }

  static Future<Map<String, dynamic>> getTransactions({int page = 1, int limit = 20}) async {
    final res = await ApiClient.get('/wallet/transactions?page=$page&limit=$limit');
    return res as Map<String, dynamic>;
  }
}
