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
    try {
      final res = await ApiClient.get('/config');
      if (res is Map<String, dynamic>) return res;
      return null;
    } catch (_) { return null; }
  }

  static Future<Map<String, dynamic>?> getUserProfile() async {
    final res = await ApiClient.get('/user/profile');
    if (res is Map<String, dynamic>) return res;
    return null;
  }

  static Future<Map<String, dynamic>?> updateUserProfile({String? username, String? avatarPath}) async {
    final body = <String, dynamic>{};
    if (username != null) body['username'] = username;
    if (avatarPath != null) body['avatarPath'] = avatarPath;
    final res = await ApiClient.post('/user/update-profile', body);
    if (res is Map<String, dynamic>) return res;
    return null;
  }

  static Future<Map<String, dynamic>?> completeOnboarding({required String username, String? dateOfBirth}) async {
    final body = <String, dynamic>{'username': username};
    if (dateOfBirth != null) body['dateOfBirth'] = dateOfBirth;
    final res = await ApiClient.post('/user/complete-onboarding', body);
    if (res is Map<String, dynamic>) return res;
    return null;
  }

  static Future<List<dynamic>?> getGamesList() async {
    final res = await ApiClient.get('/games');
    if (res is List<dynamic>) return res;
    if (res is Map<String, dynamic> && res['data'] is List) return res['data'] as List<dynamic>;
    return null;
  }

  static Future<Map<String, dynamic>> addCash({required double amount, required String paymentMethod}) async {
    return await WalletApi.createDepositOrder(amount: amount, paymentMethod: paymentMethod);
  }

  static Future<Map<String, dynamic>> withdrawCash({required double amount, required String upiId, String? idempotencyKey}) async {
    return await WalletApi.withdrawCash(amount: amount, upiId: upiId, idempotencyKey: idempotencyKey);
  }

  static Future<Map<String, dynamic>?> getTransactions({int page = 1, int limit = 20}) async {
    final res = await ApiClient.get('/wallet/transactions?page=$page&limit=$limit');
    if (res is Map<String, dynamic>) return res;
    return null;
  }

  static Future<Map<String, dynamic>?> getDashboardHeader() async {
    final res = await ApiClient.get('/app/dashboard-header');
    if (res is Map<String, dynamic>) return res;
    return null;
  }

  static Future<List<dynamic>?> getBanners() async {
    final res = await ApiClient.get('/banners');
    if (res is Map<String, dynamic> && res['data'] is List) {
      return res['data'] as List<dynamic>;
    }
    if (res is List<dynamic>) return res;
    return null;
  }

  static Future<List<dynamic>?> getBetHistory({int page = 1, int limit = 20}) async {
    final res = await ApiClient.get('/games/bet-history?page=$page&limit=$limit');
    if (res is Map<String, dynamic> && res['data'] is List) return res['data'] as List<dynamic>;
    if (res is List<dynamic>) return res;
    return null;
  }
}
