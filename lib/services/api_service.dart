import 'dart:convert';
import 'package:http/http.dart' as http;

class ApiService {
  static String serverDomain = const String.fromEnvironment(
    'SERVER_DOMAIN',
    defaultValue: 'http://localhost:5050',
  );

  static String get baseUrl => '$serverDomain/api';

  static List<String> get _candidateBaseUrls => [
        '$serverDomain/api',
        'http://localhost:5050/api',
        'http://127.0.0.1:5050/api',
        'http://10.0.2.2:5050/api',
      ];

  // 0a. Create Loggin WhatsApp Verification Token & Link
  static Future<Map<String, dynamic>?> createLogginToken() async {
    for (final base in _candidateBaseUrls) {
      try {
        final response = await http.post(
          Uri.parse('$base/auth/loggin/create-token'),
          headers: {'Content-Type': 'application/json'},
        ).timeout(const Duration(seconds: 8));

        final data = jsonDecode(response.body);
        if (response.statusCode == 200) {
          serverDomain = base.replaceAll('/api', '');
          return data;
        }
      } catch (_) {}
    }
    return {'status': 'error', 'message': 'Unable to connect to authentication server. Check connection.'};
  }

  // 0b. Server-Side Loggin Verification (Never trust client phone)
  static Future<Map<String, dynamic>?> verifyLogginToken({
    required String token,
  }) async {
    for (final base in _candidateBaseUrls) {
      try {
        final response = await http.post(
          Uri.parse('$base/auth/loggin/verify'),
          headers: {'Content-Type': 'application/json'},
          body: jsonEncode({
            'token': token,
          }),
        ).timeout(const Duration(seconds: 310)); // Allow up to 5 min TTL wait

        final data = jsonDecode(response.body);
        if (response.statusCode == 200) {
          serverDomain = base.replaceAll('/api', '');
          return data;
        } else if (data is Map<String, dynamic> && data['message'] != null) {
          return data;
        }
      } catch (_) {}
    }
    return {'status': 'error', 'message': 'Verification request timed out or server unavailable.'};
  }

  // 1. Get App Configuration & Online Users Count
  static Future<Map<String, dynamic>?> getAppConfig() async {
    try {
      final response = await http.get(Uri.parse('$baseUrl/config')).timeout(
        const Duration(seconds: 3),
      );
      if (response.statusCode == 200) {
        return jsonDecode(response.body);
      }
    } catch (_) {
      // Offline fallback
    }
    return null;
  }

  // 2. Get User Profile & Balances
  static Future<Map<String, dynamic>?> getUserProfile() async {
    try {
      final response = await http.get(Uri.parse('$baseUrl/user/profile')).timeout(
        const Duration(seconds: 3),
      );
      if (response.statusCode == 200) {
        return jsonDecode(response.body);
      }
    } catch (_) {
      // Offline fallback
    }
    return null;
  }

  // 2b. Update User Profile (Username & Avatar)
  static Future<Map<String, dynamic>?> updateUserProfile({
    String? username,
    String? avatarPath,
  }) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/user/update-profile'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'username': username,
          'avatarPath': avatarPath,
        }),
      );
      if (response.statusCode == 200) {
        return jsonDecode(response.body);
      }
    } catch (_) {
      // Fallback
    }
    return null;
  }

  // 3. Get Active Games List
  static Future<List<dynamic>?> getGamesList() async {
    try {
      final response = await http.get(Uri.parse('$baseUrl/games')).timeout(
        const Duration(seconds: 3),
      );
      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        return data['data'] as List<dynamic>;
      }
    } catch (_) {
      // Offline fallback
    }
    return null;
  }

  // 4. Create Deposit Order (POST /api/deposits) -> PENDING Status
  static Future<Map<String, dynamic>?> createDepositOrder({
    required double amount,
    String paymentMethod = 'UPI',
  }) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/deposits'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'amount': amount,
          'paymentMethod': paymentMethod,
        }),
      );
      if (response.statusCode == 201 || response.statusCode == 200) {
        return jsonDecode(response.body);
      }
    } catch (_) {}
    return null;
  }

  // 4c. Submit UTR for Deposit Order (POST /api/deposits/:depositId/utr)
  static Future<Map<String, dynamic>?> submitDepositUtr({
    required String depositId,
    required String utr,
  }) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/deposits/$depositId/utr'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'utr': utr,
        }),
      );
      return jsonDecode(response.body);
    } catch (_) {}
    return null;
  }

  // 4b. Add Cash Deposit API (Legacy / Direct)
  static Future<Map<String, dynamic>?> addCash({
    required double amount,
    required String paymentMethod,
  }) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/wallet/add-cash'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'amount': amount,
          'paymentMethod': paymentMethod,
        }),
      );
      if (response.statusCode == 200) {
        return jsonDecode(response.body);
      }
    } catch (_) {
      // Fallback
    }
    return null;
  }

  // 5. Withdraw Cash API (POST /api/withdrawals)
  static Future<Map<String, dynamic>?> withdrawCash({
    required double amount,
    required String upiId,
  }) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/withdrawals'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'amount': amount,
          'upiId': upiId,
        }),
      );
      return jsonDecode(response.body);
    } catch (_) {}
    return null;
  }

  // 6. Join Game & Deduct Entry Fee
  static Future<bool> joinGame({
    required String gameId,
    required double entryFee,
  }) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/games/join'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'gameId': gameId,
          'entryFee': entryFee,
        }),
      );
      if (response.statusCode == 200) {
        return true;
      }
    } catch (_) {}
    return false;
  }

  // 7. Get Transactions History
  static Future<List<dynamic>?> getTransactions() async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/wallet/transactions'),
      ).timeout(const Duration(seconds: 3));
      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        return data['data'] as List<dynamic>;
      }
    } catch (_) {}
    return null;
  }

  // 8. Get Promotional Banners List (Served from server)
  static Future<List<dynamic>?> getBanners() async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/banners'),
      ).timeout(const Duration(seconds: 3));
      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        return data['data'] as List<dynamic>;
      }
    } catch (_) {}
    return null;
  }

  // 9. Get Game Bet Audit Logs
  static Future<List<dynamic>?> getBetHistory() async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/games/bet-history'),
      ).timeout(const Duration(seconds: 3));
      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        return data['data'] as List<dynamic>;
      }
    } catch (_) {}
    return null;
  }

  // 10. Admin: Get Pending Deposits Queue (GET /api/admin/deposits/pending)
  static Future<List<dynamic>?> getPendingAdminDeposits({
    required String adminSecret,
  }) async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/admin/deposits/pending'),
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Secret': adminSecret,
        },
      ).timeout(const Duration(seconds: 5));
      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        return data['data'] as List<dynamic>;
      }
    } catch (_) {}
    return null;
  }

  // 10b. Admin: Confirm Deposit Order (POST /api/admin/deposits/:depositId/confirm)
  static Future<Map<String, dynamic>?> confirmAdminDeposit({
    required String depositId,
    required String adminSecret,
    String? adminNote,
  }) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/admin/deposits/$depositId/confirm'),
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Secret': adminSecret,
        },
        body: jsonEncode({
          'adminNote': adminNote ?? 'Confirmed via Admin Dashboard',
        }),
      );
      return jsonDecode(response.body);
    } catch (_) {}
    return null;
  }

  // 10c. Admin: Reject Deposit Order (POST /api/admin/deposits/:depositId/reject)
  static Future<Map<String, dynamic>?> rejectAdminDeposit({
    required String depositId,
    required String adminSecret,
    String? adminNote,
  }) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/admin/deposits/$depositId/reject'),
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Secret': adminSecret,
        },
        body: jsonEncode({
          'adminNote': adminNote ?? 'Rejected via Admin Dashboard',
        }),
      );
      return jsonDecode(response.body);
    } catch (_) {}
    return null;
  }

  // 11a. Admin: Get Pending Withdrawals Queue (GET /api/admin/withdrawals/pending)
  static Future<List<dynamic>?> getPendingAdminWithdrawals({
    required String adminSecret,
  }) async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/admin/withdrawals/pending'),
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Secret': adminSecret,
        },
      ).timeout(const Duration(seconds: 5));
      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        return data['data'] as List<dynamic>;
      }
    } catch (_) {}
    return null;
  }

  // 11b. Admin: Confirm Withdrawal Payout (POST /api/admin/withdrawals/:withdrawalId/confirm)
  static Future<Map<String, dynamic>?> confirmAdminWithdrawal({
    required String withdrawalId,
    required String adminSecret,
    String? adminNote,
  }) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/admin/withdrawals/$withdrawalId/confirm'),
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Secret': adminSecret,
        },
        body: jsonEncode({
          'adminNote': adminNote ?? 'Payout confirmed via Admin Dashboard',
        }),
      );
      return jsonDecode(response.body);
    } catch (_) {}
    return null;
  }

  // 11c. Admin: Reject Withdrawal Request (POST /api/admin/withdrawals/:withdrawalId/reject)
  static Future<Map<String, dynamic>?> rejectAdminWithdrawal({
    required String withdrawalId,
    required String adminSecret,
    String? adminNote,
  }) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/admin/withdrawals/$withdrawalId/reject'),
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Secret': adminSecret,
        },
        body: jsonEncode({
          'adminNote': adminNote ?? 'Rejected via Admin Dashboard',
        }),
      );
      return jsonDecode(response.body);
    } catch (_) {}
    return null;
  }
}

