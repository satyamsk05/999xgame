import 'package:url_launcher/url_launcher.dart';
import '../../../core/api/api_client.dart';
import '../../../core/money/money_paise.dart';

class WalletApi {
  static Future<Map<String, dynamic>> createDepositOrderPaise({required MoneyPaise amount, String paymentMethod = 'UPI'}) async {
    final res = await ApiClient.post('/deposits', {'amount': amount.rupees, 'amountPaise': amount.value, 'paymentMethod': paymentMethod});
    final data = res is Map<String, dynamic> ? res : <String, dynamic>{};
    final nested = data['data'];
    final order = nested is Map<String, dynamic> ? nested : data;
    final paymentUrl = order['paymentUrl']?.toString();
    if (paymentUrl == null || paymentUrl.isEmpty) throw Exception('Payment page link was not returned by the server.');
    final uri = Uri.tryParse(paymentUrl);
    if (uri == null || !(uri.scheme == 'http' || uri.scheme == 'https')) throw Exception('Invalid payment page link returned by the server.');
    final opened = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!opened) throw Exception('Could not open the payment page. Please try again.');
    return data;
  }

  static Future<Map<String, dynamic>> withdrawCashPaise({
    required MoneyPaise amount,
    String paymentMode = 'UPI',
    String? upiId,
    String? upiName,
    String? bankAccountNumber,
    String? bankIfsc,
    String? bankAccountHolder,
    String? bankName,
    String? idempotencyKey,
  }) async {
    final payload = <String, dynamic>{
      'amount': amount.rupees,
      'amountPaise': amount.value,
      'paymentMode': paymentMode,
    };
    if (upiId != null && upiId.isNotEmpty) payload['upiId'] = upiId;
    if (upiName != null && upiName.isNotEmpty) payload['upiName'] = upiName;
    if (bankAccountNumber != null && bankAccountNumber.isNotEmpty) payload['bankAccountNumber'] = bankAccountNumber;
    if (bankIfsc != null && bankIfsc.isNotEmpty) payload['bankIfsc'] = bankIfsc;
    if (bankAccountHolder != null && bankAccountHolder.isNotEmpty) payload['bankAccountHolder'] = bankAccountHolder;
    if (bankName != null && bankName.isNotEmpty) payload['bankName'] = bankName;
    if (idempotencyKey != null) payload['idempotencyKey'] = idempotencyKey;

    final res = await ApiClient.post('/withdrawals', payload);
    return res as Map<String, dynamic>;
  }

  static Future<Map<String, dynamic>> getUserProfile() async {
    final res = await ApiClient.get('/user/profile');
    return res as Map<String, dynamic>;
  }

  static Future<Map<String, dynamic>> getPayoutMethods() async {
    final res = await ApiClient.get('/user/payout-methods');
    if (res is Map<String, dynamic> && res['data'] is Map<String, dynamic>) {
      return res['data'] as Map<String, dynamic>;
    }
    return res is Map<String, dynamic> ? res : <String, dynamic>{};
  }

  static Future<Map<String, dynamic>> savePayoutMethods({
    String? bankAccountNumber,
    String? bankIfsc,
    String? bankAccountHolder,
    String? bankName,
    String? upiId,
    String? upiName,
  }) async {
    final payload = <String, dynamic>{};
    if (bankAccountNumber != null) payload['bankAccountNumber'] = bankAccountNumber;
    if (bankIfsc != null) payload['bankIfsc'] = bankIfsc;
    if (bankAccountHolder != null) payload['bankAccountHolder'] = bankAccountHolder;
    if (bankName != null) payload['bankName'] = bankName;
    if (upiId != null) payload['upiId'] = upiId;
    if (upiName != null) payload['upiName'] = upiName;

    final res = await ApiClient.post('/user/payout-methods', payload);
    return res as Map<String, dynamic>;
  }

  static Future<Map<String, dynamic>> createDepositOrder({required double amount, String paymentMethod = 'UPI'}) =>
      createDepositOrderPaise(amount: MoneyPaise.fromRupees(amount), paymentMethod: paymentMethod);

  static Future<Map<String, dynamic>> submitUtr({required String depositId, required String utr}) async {
    final res = await ApiClient.post('/deposits/$depositId/utr', {'utr': utr});
    return res as Map<String, dynamic>;
  }

  static Future<Map<String, dynamic>> withdrawCash({
    required double amount,
    String paymentMode = 'UPI',
    String? upiId,
    String? upiName,
    String? bankAccountNumber,
    String? bankIfsc,
    String? bankAccountHolder,
    String? bankName,
    String? idempotencyKey,
  }) =>
      withdrawCashPaise(
        amount: MoneyPaise.fromRupees(amount),
        paymentMode: paymentMode,
        upiId: upiId,
        upiName: upiName,
        bankAccountNumber: bankAccountNumber,
        bankIfsc: bankIfsc,
        bankAccountHolder: bankAccountHolder,
        bankName: bankName,
        idempotencyKey: idempotencyKey,
      );

  static Future<Map<String, dynamic>> getTransactions({int page = 1, int limit = 20}) async {
    final res = await ApiClient.get('/wallet/transactions?page=$page&limit=$limit');
    if (res is List) return {'items': res, 'page': page, 'limit': limit, 'total': res.length};
    if (res is Map<String, dynamic>) {
      if (res['items'] is List) return res;
      if (res['data'] is List) return {'items': res['data'], 'page': page, 'limit': limit, 'total': (res['data'] as List).length};
      return res;
    }
    return {'items': <dynamic>[]};
  }
}