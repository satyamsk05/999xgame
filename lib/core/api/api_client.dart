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
      return _handleResponse(response);
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
      return _handleResponse(response);
    } catch (e) {
      if (e is ApiException) rethrow;
      throw ApiException(
          code: 'NETWORK_ERROR',
          message: 'Network connection failed: ${e.toString()}',
          statusCode: 0);
    }
  }

  static dynamic _handleResponse(http.Response response) {
    dynamic jsonBody;
    try {
      jsonBody = jsonDecode(response.body);
    } catch (_) {
      throw ApiException(code: 'PARSE_ERROR', message: 'Invalid response format from server', statusCode: response.statusCode);
    }

    if (response.statusCode >= 200 && response.statusCode < 300) {
      if (jsonBody is Map<String, dynamic> && jsonBody.containsKey('success')) {
        if (jsonBody['success'] == true) {
          return jsonBody['data'];
        } else {
          final err = jsonBody['error'];
          throw ApiException(
            code: err?['code']?.toString() ?? 'ERROR',
            message: err?['message']?.toString() ?? 'Request failed',
            statusCode: response.statusCode,
          );
        }
      }
      return jsonBody;
    } else {
      if (jsonBody is Map<String, dynamic> && jsonBody.containsKey('error')) {
        final err = jsonBody['error'];
        throw ApiException(
          code: err?['code']?.toString() ?? 'HTTP_${response.statusCode}',
          message: err?['message']?.toString() ?? 'Server error',
          statusCode: response.statusCode,
        );
      }
      throw ApiException(code: 'HTTP_${response.statusCode}', message: 'Server returned HTTP ${response.statusCode}', statusCode: response.statusCode);
    }
  }
}
