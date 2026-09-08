import 'dart:convert';
import 'package:http/http.dart' as http;
import '../storage/token_manager.dart';
import '../../services/api_service.dart';

class ApiException implements Exception {
  final String code;
  final String message;
  final int? statusCode;

  ApiException({required this.code, required this.message, required this.statusCode});

  @override
  String toString() => 'ApiException [$code] (${statusCode ?? 0}): $message';
}

class ApiClient {
  static String get serverBaseUrl => ApiService.baseUrl;

  static Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        if (TokenManager.token?.isNotEmpty == true)
          'Authorization': 'Bearer ${TokenManager.token}',
      };

  static Future<dynamic> get(String endpoint) async {
    try {
      final response = await http
          .get(Uri.parse('$serverBaseUrl$endpoint'), headers: _headers)
          .timeout(const Duration(seconds: 10));
      return _handleResponse(response);
    } catch (e) {
      if (e is ApiException) rethrow;
      throw ApiException(code: 'NETWORK_ERROR', message: 'Network connection failed. Please try again.', statusCode: 0);
    }
  }

  static Future<dynamic> post(String endpoint, Map<String, dynamic> body, {Duration timeout = const Duration(seconds: 15)}) async {
    try {
      final response = await http
          .post(Uri.parse('$serverBaseUrl$endpoint'), headers: _headers, body: jsonEncode(body))
          .timeout(timeout);
      return _handleResponse(response);
    } catch (e) {
      if (e is ApiException) rethrow;
      throw ApiException(code: 'NETWORK_ERROR', message: 'Network connection failed. Please try again.', statusCode: 0);
    }
  }

  static dynamic _handleResponse(http.Response response) {
    final status = response.statusCode;
    dynamic body;
    try {
      body = jsonDecode(response.body);
    } catch (_) {
      throw ApiException(code: 'PARSE_ERROR', message: 'Invalid response from server.', statusCode: status);
    }

    final map = body is Map<String, dynamic> ? body : <String, dynamic>{};
    final error = map['error'] is Map<String, dynamic> ? map['error'] as Map<String, dynamic> : map;
    final code = error['code']?.toString();
    final message = error['message']?.toString();

    if (status == 401) {
      // Do not immediately clear a newly issued token while login/verification is in progress.
      TokenManager.clearSession();
      throw ApiException(code: code ?? 'UNAUTHORIZED', message: message ?? 'Session expired. Please log in again.', statusCode: 401);
    }
    if (status == 503) {
      throw ApiException(code: code ?? 'SERVICE_UNAVAILABLE', message: message ?? 'Service temporarily unavailable. Please try again.', statusCode: 503);
    }
    if (status < 200 || status >= 300) {
      throw ApiException(code: code ?? 'HTTP_$status', message: message ?? 'Request failed. Please try again.', statusCode: status);
    }

    if (map.containsKey('success')) {
      if (map['success'] == true) return map['data'];
      throw ApiException(code: code ?? 'ERROR', message: message ?? 'Request failed.', statusCode: status);
    }
    return body;
  }
}