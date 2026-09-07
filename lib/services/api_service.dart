import 'package:flutter/foundation.dart';
import '../core/api/api_client.dart';
import '../features/wallet/data/wallet_api.dart';

class ApiService {
  static String serverDomain = const String.fromEnvironment(
    'SERVER_DOMAIN',
    defaultValue: kDebugMode ? 'http://localhost:5050' : 'https://ingames.onrender.com',
  );

  static String get baseUrl => '$serverDomain/api';

  static Future<Map<String, dynamic>?> getAppConfig() async {
    try { return (await ApiClient.get('/config')) as Map<String, dynamic>; } catch (_) { return null; }
  }
  static Future<Map<String, dynamic>?> getUserProfile() async {
    try { return (await ApiClient.get('/user/profile')) as Map<String, dynamic>; } catch (_) { return null; }
  }
  static Future<Map<String, dynamic>?> updateUserProfile({String? username, String? avatarPath}) async {
    final body = <String, dynamic>{};
    if (username != null) body['username'] = username;
    if (avatarPath != null) body['avatarPath'] = avatarPath;
    try { return (await ApiClient.post('/user/update-profile', body)) as Map<String, dynamic>; } catch (_) { return null; }
  }
  static Future<List<dynamic>?> getGamesList() async {
    try { return (await ApiClient.get('/games')) as List<dynamic>; } catch (_) { return null; }
  }
  static Future<Map<String, dynamic>?> addCash({required double amount, required String paymentMethod}) async {
    try {
      return await WalletApi.createDepositOrder(amount: amount, paymentMethod: paymentMethod);
    } catch (_) {
      return null;
    }
  }
  static Future<Map<String, dynamic>?> withdrawCash({required double amount, required String upiId, String? idempotencyKey}) async {
    try {
      return await WalletApi.withdrawCash(amount: amount, upiId: upiId, idempotencyKey: idempotencyKey);
    } catch (_) {
      return null;
    }
  }
  static Future<bool> joinGame({required String gameId, required double entryFee}) async {
    return true;
  }
  static Future<Map<String, dynamic>?> getTransactions({int page = 1, int limit = 20}) async {
    try { return (await ApiClient.get('/wallet/transactions?page=$page&limit=$limit')) as Map<String, dynamic>; } catch (_) { return null; }
  }
  static Future<Map<String, dynamic>?> getDashboardHeader() async {
    try {
      final res = await ApiClient.get('/app/dashboard-header');
      if (res is Map<String, dynamic>) return res;
      return null;
    } catch (_) {
      return null;
    }
  }

  static Future<List<dynamic>?> getBanners() async {
    try {
      final res = await ApiClient.get('/banners');
      if (res is Map<String, dynamic> && res['data'] is List) {
        return res['data'] as List<dynamic>;
      }
      return null;
    } catch (_) {
      return null;
    }
  }


  static Future<List<dynamic>?> getBetHistory({int page = 1, int limit = 20}) async {
    try {
      final res = await ApiClient.get('/games/bet-history?page=$page&limit=$limit');
      if (res is Map<String, dynamic>) return res['items'] as List<dynamic>? ?? <dynamic>[];
      return res as List<dynamic>;
    } catch (_) { return null; }
  }
}
