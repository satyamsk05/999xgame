import 'dart:convert';
import 'package:http/http.dart' as http;
import '../storage/token_manager.dart';
import '../../services/api_service.dart';

class ApiException implements Exception {
  final String code;
  final String message;
  final int statusCode;

  ApiException({
    required this.code,
    required this.message,
    required this.statusCode,
  });

  @override
  String toString() => 'ApiException [$code] ($statusCode): $message';
}

class ApiClient {
  static String get serverBaseUrl => ApiService.baseUrl;

  static Map<String, String> get _headers {
    final headers = <String, String>{
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
    final token = TokenManager.token;
    if (token != null && token.isNotEmpty) {
      headers['Authorization'] = 'Bearer $token';
    }
    return headers;
  }

  static Future<dynamic> get(String endpoint) async {
    final uri = Uri.parse('$serverBaseUrl$endpoint');
    try {
      final response = await http.get(uri, headers: _headers).timeout(const Duration(seconds: 10));
      return await _handleResponse(response);
    } catch (e) {
      if (e is ApiException) rethrow;
      throw ApiException(code: 'NETWORK_ERROR', message: 'Network connection failed: ${e.toString()}', statusCode: 0);
    }
  }

  static Future<dynamic> post(
    String endpoint,
    Map<String, dynamic> body, {
    Duration timeout = const Duration(seconds: 15),
  }) async {
    final uri = Uri.parse('$serverBaseUrl$endpoint');
    try {
      final response = await http
          .post(
            uri,
            headers: _headers,
            body: jsonEncode(body),
          )
          .timeout(timeout);
      return await _handleResponse(response);
    } catch (e) {
      if (e is ApiException) rethrow;
      throw ApiException(
          code: 'NETWORK_ERROR',
          message: 'Network connection failed: ${e.toString()}',
          statusCode: 0);
    }
  }

  static Future<dynamic> _handleResponse(http.Response response) async {
    final int status = response.statusCode;

    dynamic jsonBody;
    bool parsed = false;
    try {
      jsonBody = jsonDecode(response.body);
      parsed = true;
    } catch (_) {
      jsonBody = null;
    }

    // Pull the standardized error object ({ code, message }) if present. The backend
    // emits { success:false, error:{ code, message } } and a legacy { code, message }.
    Map<String, dynamic>? errObj;
    if (jsonBody is Map<String, dynamic>) {
      if (jsonBody['error'] is Map<String, dynamic>) {
        errObj = jsonBody['error'] as Map<String, dynamic>;
      } else if (jsonBody.containsKey('code') || jsonBody.containsKey('message')) {
        errObj = jsonBody;
      }
    }

    // 401 (sec 33/35): the server no longer recognizes this session. Drop the stale
    // local token so the app stops presenting an invalid credential. A cached token is
    // never proof of a valid session — the server is authoritative.
    if (status == 401) {
      if (TokenManager.token != null) {
        await TokenManager.clearSession();
      }
      throw ApiException(
        code: errObj?['code']?.toString() ?? 'UNAUTHORIZED',
        message: errObj?['message']?.toString() ?? 'Session expired. Please log in again.',
        statusCode: 401,
      );
    }

    // 503 (sec 3/33): backend or database unavailable. Surface it, never hide it.
    if (status == 503) {
      throw ApiException(
        code: errObj?['code']?.toString() ?? 'SERVICE_UNAVAILABLE',
        message: errObj?['message']?.toString() ?? 'Service temporarily unavailable. Please try again.',
        statusCode: 503,
      );
    }

    if (status >= 200 && status < 300) {
      if (!parsed) {
        throw ApiException(code: 'PARSE_ERROR', message: 'Invalid response format from server', statusCode: status);
      }
      if (jsonBody is Map<String, dynamic> && jsonBody.containsKey('success')) {
        if (jsonBody['success'] == true) {
          return jsonBody['data'];
        }
        throw ApiException(
          code: errObj?['code']?.toString() ?? 'ERROR',
          message: errObj?['message']?.toString() ?? 'Request failed',
          statusCode: status,
        );
      }
      return jsonBody;
    }

    // Any other non-2xx: convert to an ApiException (never hide server errors).
    throw ApiException(
      code: errObj?['code']?.toString() ?? 'HTTP_$status',
      message: errObj?['message']?.toString() ?? 'Server returned HTTP $status',
      statusCode: status,
    );
  }
}
