import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import '../core/api/api_client.dart';
import '../features/wallet/data/wallet_api.dart';

class ApiService {
  static const String _configuredServerDomain = String.fromEnvironment('SERVER_DOMAIN');

  static String get serverDomain {
    if (_configuredServerDomain.isNotEmpty) {
      return _configuredServerDomain;
    }
    if (kDebugMode) {
      return 'http://localhost:5050';
    }
    return 'http://65.1.92.155';
  }

  static String get baseUrl => '$serverDomain/api';

  static Future<bool> isBackendReady({Duration timeout = const Duration(seconds: 5)}) async {
    try {
      final response = await http.get(Uri.parse('$serverDomain/ready')).timeout(timeout);
      return response.statusCode == 200;
    } catch (_) {
      return false;
    }
  }

  static Future<Map<String, dynamic>?> getAppConfig() async {
    try {
      final res = await ApiClient.get('/config');
      return res is Map<String, dynamic> ? res : null;
    } on ApiException catch (e) {
      debugPrint('[ApiService] getAppConfig: ${e.code}');
      return null;
    }
  }

  static Future<Map<String, dynamic>> getUserProfile() async {
    final res = await ApiClient.get('/user/profile');
    if (res is Map<String, dynamic>) return res;
    throw ApiException(code: 'INVALID_RESPONSE', message: 'Invalid profile response.', statusCode: 200);
  }

  static Future<Map<String, dynamic>?> updateUserProfile({String? username, String? avatarPath}) async {
    final body = <String, dynamic>{};
    if (username != null) body['username'] = username.trim();
    if (avatarPath != null) body['avatarPath'] = avatarPath;
    if (body.isEmpty) return null;
    final res = await ApiClient.post('/user/update-profile', body);
    return res is Map<String, dynamic> ? res : null;
  }

  static Future<Map<String, dynamic>?> completeOnboarding({required String username}) async {
    final name = username.trim();
    if (name.length < 2) {
      throw ApiException(code: 'INVALID_USERNAME', message: 'Name must be at least 2 characters.', statusCode: 400);
    }
    final res = await ApiClient.post('/user/complete-onboarding', {'username': name});
    return res is Map<String, dynamic> ? res : null;
  }

  static Future<void> logout() async {
    // The backend revokes the current JWT. Local session cleanup must still be
    // performed by the caller so logout succeeds even when the network is down.
    await ApiClient.post('/auth/logout', const <String, dynamic>{});
  }

  static Future<List<dynamic>?> getGamesList() async {
    final res = await ApiClient.get('/games');
    if (res is List<dynamic>) return res;
    if (res is Map<String, dynamic> && res['data'] is List) return List<dynamic>.from(res['data'] as List);
    return null;
  }

  static Future<Map<String, dynamic>> addCash({required double amount, required String paymentMethod}) =>
      WalletApi.createDepositOrder(amount: amount, paymentMethod: paymentMethod);

  static Future<Map<String, dynamic>> withdrawCash({required double amount, required String upiId, String? idempotencyKey}) =>
      WalletApi.withdrawCash(amount: amount, upiId: upiId, idempotencyKey: idempotencyKey);

  static Future<Map<String, dynamic>?> getTransactions({int page = 1, int limit = 20}) async {
    final safePage = page < 1 ? 1 : page;
    final safeLimit = limit.clamp(1, 100);
    final res = await ApiClient.get('/wallet/transactions?page=$safePage&limit=$safeLimit');
    return res is Map<String, dynamic> ? res : null;
  }

  static Future<Map<String, dynamic>?> getDashboardHeader() async {
    final res = await ApiClient.get('/app/dashboard-header');
    return res is Map<String, dynamic> ? res : null;
  }

  static Future<List<dynamic>?> getBanners() async {
    final res = await ApiClient.get('/banners');
    if (res is List<dynamic>) return res;
    if (res is Map<String, dynamic> && res['data'] is List) return List<dynamic>.from(res['data'] as List);
    return null;
  }

  static Future<List<dynamic>?> getBetHistory({int page = 1, int limit = 20}) async {
    final safePage = page < 1 ? 1 : page;
    final safeLimit = limit.clamp(1, 100);
    final res = await ApiClient.get('/games/bet-history?page=$safePage&limit=$safeLimit');
    if (res is List<dynamic>) return res;
    if (res is Map<String, dynamic> && res['data'] is List) return List<dynamic>.from(res['data'] as List);
    return null;
  }
}