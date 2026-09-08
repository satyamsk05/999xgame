import '../../../core/api/api_client.dart';

class AuthApi {
  static Future<Map<String, dynamic>> createLogginToken() async {
    final res = await ApiClient.post('/auth/loggin/create-token', {});
    return res as Map<String, dynamic>;
  }

  static Future<Map<String, dynamic>> checkStatus(String token) async {
    final res = await ApiClient.get('/auth/loggin/status/$token');
    return res as Map<String, dynamic>;
  }

  static Future<Map<String, dynamic>> verifyLogginToken(String token, {Duration timeout = const Duration(seconds: 12)}) async {
    final res = await ApiClient.post('/auth/loggin/verify', {'token': token}, timeout: timeout);
    return res as Map<String, dynamic>;
  }
}
