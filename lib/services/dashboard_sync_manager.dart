import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'api_service.dart';
import 'realtime_sync_service.dart';
import '../core/storage/token_manager.dart';

/// Synchronizes non-authoritative dashboard presentation data.
///
/// Local cache is strictly a last-known snapshot. It is never used as the
/// source of truth for wallet balances, bets, settlements or other money state.
class DashboardSyncManager {
  static const String _cacheKey = 'cached_dashboard_header_v2';

  static final ValueNotifier<Map<String, dynamic>> dashboardData = ValueNotifier<Map<String, dynamic>>({});
  static final ValueNotifier<bool> isSyncing = ValueNotifier<bool>(true);
  static final ValueNotifier<bool> isBackendOnline = ValueNotifier<bool>(false);
  static bool _initialized = false;
  static Timer? _healthTimer;

  static Future<void> init() async {
    if (_initialized) return;
    _initialized = true;

    try {
      final prefs = await SharedPreferences.getInstance();
      final cachedStr = prefs.getString(_cacheKey);
      if (cachedStr != null && cachedStr.isNotEmpty) {
        final decoded = jsonDecode(cachedStr);
        if (decoded is Map) {
          final cachedData = Map<String, dynamic>.from(decoded);
          _stripFinancialData(cachedData);
          if (cachedData.isNotEmpty) {
            dashboardData.value = cachedData;
            isSyncing.value = false;
          }
        }
      }
    } catch (_) {}

    final realtime = RealtimeSyncService.instance;
    realtime.onAuthoritativeRefresh = syncWithServer;
    if (TokenManager.isAuthenticated && !realtime.isConnected.value) {
      unawaited(realtime.start());
    }

    await refreshBackendHealth();
    _healthTimer?.cancel();
    _healthTimer = Timer.periodic(const Duration(seconds: 15), (_) => refreshBackendHealth());
    await syncWithServer();
  }

  static Future<void> refreshBackendHealth() async {
    isBackendOnline.value = await ApiService.isBackendReady();
  }

  static Future<void> dispose() async {
    _healthTimer?.cancel();
    _healthTimer = null;
    await RealtimeSyncService.instance.stop();
    _initialized = false;
  }

  static Future<void> syncWithServer() async {
    final realtime = RealtimeSyncService.instance;
    realtime.onAuthoritativeRefresh = syncWithServer;
    if (TokenManager.isAuthenticated && !realtime.isConnected.value) {
      unawaited(realtime.start());
    }

    isSyncing.value = true;
    try {
      final response = await ApiService.getDashboardHeader();
      final bannersList = await ApiService.getBanners();
      final gamesList = await ApiService.getGamesList();

      final Map<String, dynamic> rawData =
          (response != null && response['data'] is Map<String, dynamic>)
              ? Map<String, dynamic>.from(response['data'] as Map)
              : (response != null ? Map<String, dynamic>.from(response) : <String, dynamic>{});

      if (bannersList != null && bannersList.isNotEmpty) {
        rawData['banners'] = bannersList;
      }
      if (gamesList != null && gamesList.isNotEmpty) {
        rawData['games'] = gamesList;
      } else if (!rawData.containsKey('games') || (rawData['games'] as List?)?.isEmpty == true) {
        rawData['games'] = _defaultGames;
      }

      _stripFinancialData(rawData);

      if (rawData.isNotEmpty) {
        try {
          final prefs = await SharedPreferences.getInstance();
          await prefs.setString(_cacheKey, jsonEncode(rawData));
        } catch (_) {}
        dashboardData.value = rawData;
      }
    } catch (e) {
      debugPrint('DashboardSyncManager error: $e');
      if (dashboardData.value.isEmpty) {
        dashboardData.value = {'games': _defaultGames};
      }
    } finally {
      isSyncing.value = false;
    }
  }

  static const List<Map<String, dynamic>> _defaultGames = [
    {
      'id': 'seven_up_down',
      'title': '7 Up Down (Dice)',
      'status': 'LIVE',
      'isAvailable': true,
      'entryFee': 10.0,
      'prizePool': 18.0,
      'route': '/games/seven_up_down/index.html',
      'gameUrl': '/games/seven_up_down/index.html',
      'imagePath': 'Assets/images/7updown.png',
      'accentColor': '#00E676',
    },
    {
      'id': 'dragon_tiger',
      'title': 'Dragon Vs Tiger',
      'status': 'COMING_SOON',
      'isAvailable': false,
      'entryFee': 10.0,
      'prizePool': 18.0,
      'route': '/games/dragon_tiger/index.html',
      'gameUrl': '/games/dragon_tiger/index.html',
      'imagePath': 'Assets/images/dtgame.png',
      'accentColor': '#FF1744',
    },
    {
      'id': 'crush',
      'title': 'Classic Dice',
      'status': 'COMING_SOON',
      'isAvailable': false,
      'entryFee': 10.0,
      'prizePool': 18.0,
      'route': '/games/crush/index.html',
      'gameUrl': '/games/crush/index.html',
      'imagePath': 'Assets/images/classic_dice.png',
      'accentColor': '#2979FF',
    },
  ];

  static void _stripFinancialData(Map<String, dynamic> data) {
    final profile = data['profile'];
    if (profile is Map) {
      profile.remove('balance');
      profile.remove('depositBalance');
      profile.remove('winningsBalance');
      profile.remove('rewardsBalance');
      profile.remove('totalBalance');
    }

    final wallet = data['wallet'];
    if (wallet is Map) {
      wallet.remove('balance');
      wallet.remove('depositBalance');
      wallet.remove('winningsBalance');
      wallet.remove('rewardsBalance');
      wallet.remove('totalBalance');
    }
  }
}
