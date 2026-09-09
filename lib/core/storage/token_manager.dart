import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

class TokenManager {
  static const String _keyToken = 'auth_jwt_token';
  static const String _keyUserId = 'auth_user_id';
  static const String _keyUserName = 'auth_user_name';
  static const String _keyUserPhone = 'auth_user_phone';
  static const String _keyUserAvatar = 'auth_user_avatar';

  static const FlutterSecureStorage _secureStorage = FlutterSecureStorage();

  static String? _cachedToken;
  static String? _cachedUserId;

  static Future<void> init() async {
    final prefs = await SharedPreferences.getInstance();
    final storedUserId = prefs.getString(_keyUserId);

    // Migrate legacy JWTs that were stored in SharedPreferences. The token is
    // removed from the legacy store only after secure storage confirms the write.
    var token = await _secureStorage.read(key: _keyToken);
    if (token == null || token.isEmpty) {
      final legacyToken = prefs.getString(_keyToken);
      if (legacyToken != null && legacyToken.isNotEmpty && storedUserId != null) {
        if (_isUsableToken(legacyToken, storedUserId)) {
          await _secureStorage.write(key: _keyToken, value: legacyToken);
          token = legacyToken;
          await prefs.remove(_keyToken);
        } else {
          await prefs.remove(_keyToken);
        }
      }
    }

    if (_isUsableToken(token, storedUserId)) {
      _cachedToken = token;
      _cachedUserId = storedUserId;
      return;
    }

    _cachedToken = null;
    _cachedUserId = null;
    await _clearPersistedSession(prefs);
  }

  static String? get token => _cachedToken;
  static String? get userId => _cachedUserId;
  static bool get isAuthenticated =>
      _cachedToken != null &&
      _cachedToken!.isNotEmpty &&
      _cachedUserId != null &&
      _cachedUserId!.isNotEmpty;

  static Future<void> saveSession({
    required String token,
    required String userId,
    String? username,
    String? phone,
    String? avatarPath,
  }) async {
    if (!_isUsableToken(token, userId)) {
      throw const FormatException('Invalid or expired authentication token.');
    }

    final prefs = await SharedPreferences.getInstance();

    // Persist the sensitive credential first. If secure storage fails, don't
    // mark the session authenticated or leave a plaintext fallback behind.
    await _secureStorage.write(key: _keyToken, value: token);
    try {
      await prefs.setString(_keyUserId, userId);
      if (username != null) await prefs.setString(_keyUserName, username);
      if (phone != null) await prefs.setString(_keyUserPhone, phone);
      if (avatarPath != null) await prefs.setString(_keyUserAvatar, avatarPath);
      await prefs.remove(_keyToken);
    } catch (_) {
      await _secureStorage.delete(key: _keyToken);
      rethrow;
    }

    _cachedToken = token;
    _cachedUserId = userId;
  }

  static Future<void> clearSession() async {
    _cachedToken = null;
    _cachedUserId = null;

    final prefs = await SharedPreferences.getInstance();
    await _secureStorage.delete(key: _keyToken);
    await _clearPersistedSession(prefs);
  }

  static Future<void> _clearPersistedSession(SharedPreferences prefs) async {
    await prefs.remove(_keyToken);
    await prefs.remove(_keyUserId);
    await prefs.remove(_keyUserName);
    await prefs.remove(_keyUserPhone);
    await prefs.remove(_keyUserAvatar);
  }

  /// Performs local JWT sanity checks for restored credentials. This does not replace
  /// server-side signature verification; it prevents obviously stale/corrupt sessions
  /// from being treated as authenticated before the first API request.
  static bool _isUsableToken(String? token, String? expectedUserId) {
    if (token == null || token.isEmpty || expectedUserId == null || expectedUserId.isEmpty) {
      return false;
    }

    try {
      final parts = token.split('.');
      if (parts.length != 3) return false;

      final payloadBytes = base64Url.decode(base64Url.normalize(parts[1]));
      final payload = jsonDecode(utf8.decode(payloadBytes));
      if (payload is! Map<String, dynamic>) return false;

      if (payload['type']?.toString() != 'USER') return false;
      if (payload['sub']?.toString() != expectedUserId) return false;

      final exp = payload['exp'];
      if (exp is! num) return false;
      final nowSeconds = DateTime.now().millisecondsSinceEpoch ~/ 1000;
      if (exp.toInt() <= nowSeconds) return false;

      return true;
    } catch (_) {
      return false;
    }
  }
}
