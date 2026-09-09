import 'dart:math';

import '../../../core/api/api_client.dart';

class GameApi {
  static final Random _secureRandom = Random.secure();

  /// Creates a backend-compatible idempotency key for one logical bet action.
  /// The caller should retain the key and reuse it when retrying that action.
  static String newIdempotencyKey() {
    final bytes = List<int>.generate(16, (_) => _secureRandom.nextInt(256));
    final hex = bytes.map((value) => value.toRadixString(16).padLeft(2, '0')).join();
    return 'bet_$hex';
  }

  static Future<List<dynamic>> getGamesList() async {
    final res = await ApiClient.get('/games');
    if (res is Map<String, dynamic> && res.containsKey('data') && res['data'] is List) {
      return res['data'] as List<dynamic>;
    }
    if (res is List<dynamic>) return res;
    return <dynamic>[];
  }

  static Future<Map<String, dynamic>> getCurrent7UpDownRound() async {
    final res = await ApiClient.get('/games/7updown/current-round');
    if (res is Map<String, dynamic> && res.containsKey('data') && res['data'] is Map<String, dynamic>) {
      return res['data'] as Map<String, dynamic>;
    }
    return res is Map<String, dynamic> ? res : <String, dynamic>{};
  }

  static Future<Map<String, dynamic>> placeBet({
    required String roundId,
    required String betType,
    required double stakeAmount,
    String? idempotencyKey,
  }) async {
    // Backward-compatible fallback for existing callers. New UI flows should
    // create the key once with newIdempotencyKey() and reuse it for retries.
    final key = (idempotencyKey == null || idempotencyKey.trim().isEmpty)
        ? newIdempotencyKey()
        : idempotencyKey.trim();

    final res = await ApiClient.post('/games/7updown/bets', {
      'roundId': roundId,
      'betType': betType,
      'stake': stakeAmount,
      'idempotencyKey': key,
    });
    if (res is Map<String, dynamic> && res.containsKey('data') && res['data'] is Map<String, dynamic>) {
      return res['data'] as Map<String, dynamic>;
    }
    return res is Map<String, dynamic> ? res : <String, dynamic>{};
  }

  static Future<List<dynamic>> getBetHistory({int page = 1, int limit = 20}) async {
    final res = await ApiClient.get('/games/bet-history?page=$page&limit=$limit');
    if (res is Map<String, dynamic>) {
      if (res['data'] is List) return res['data'] as List<dynamic>;
      if (res['items'] is List) return res['items'] as List<dynamic>;
    }
    if (res is List<dynamic>) return res;
    return <dynamic>[];
  }
}
