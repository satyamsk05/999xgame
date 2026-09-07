import 'package:shared_preferences/shared_preferences.dart';

class TokenManager {
  static const String _keyToken = 'auth_jwt_token';
  static const String _keyUserId = 'auth_user_id';
  static const String _keyUserName = 'auth_user_name';
  static const String _keyUserPhone = 'auth_user_phone';
  static const String _keyUserAvatar = 'auth_user_avatar';

  static String? _cachedToken;
  static String? _cachedUserId;

  static Future<void> init() async {
    final prefs = await SharedPreferences.getInstance();
    _cachedToken = prefs.getString(_keyToken);
    _cachedUserId = prefs.getString(_keyUserId);
  }

  static String? get token => _cachedToken;
  static String? get userId => _cachedUserId;
  static bool get isAuthenticated => _cachedToken != null && _cachedToken!.isNotEmpty;

  static Future<void> saveSession({
    required String token,
    required String userId,
    String? username,
    String? phone,
    String? avatarPath,
  }) async {
    _cachedToken = token;
    _cachedUserId = userId;

    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_keyToken, token);
    await prefs.setString(_keyUserId, userId);
    if (username != null) await prefs.setString(_keyUserName, username);
    if (phone != null) await prefs.setString(_keyUserPhone, phone);
    if (avatarPath != null) await prefs.setString(_keyUserAvatar, avatarPath);
  }

  static Future<void> clearSession() async {
    _cachedToken = null;
    _cachedUserId = null;

    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_keyToken);
    await prefs.remove(_keyUserId);
    await prefs.remove(_keyUserName);
    await prefs.remove(_keyUserPhone);
    await prefs.remove(_keyUserAvatar);
  }
}
