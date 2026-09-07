import '../../../core/api/api_client.dart';

class GameApi {
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
    final res = await ApiClient.post('/games/7updown/bets', {
      'roundId': roundId,
      'betType': betType,
      'stake': stakeAmount,
      'idempotencyKey': idempotencyKey,
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
