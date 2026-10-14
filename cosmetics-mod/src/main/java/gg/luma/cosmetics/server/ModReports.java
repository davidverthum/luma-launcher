package gg.luma.cosmetics.server;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import gg.luma.cosmetics.ModsPayload;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;
import net.fabricmc.fabric.api.networking.v1.ServerPlayNetworking;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.network.ServerPlayerEntity;

/**
 * «Проверка сборки»: which mods each player came with, for the admin panel (/luma mods over RCON).
 * It doesn't kick anyone — a modified client can report anything — it just makes it visible. Mods
 * whose ids look like cheats are flagged.
 */
final class ModReports {
	private record Report(boolean packKnown, List<ModsPayload.Mod> mods) {}

	private static final Map<UUID, Report> REPORTS = new ConcurrentHashMap<>();
	/** Cheat clients and X-ray-style helpers by mod id; whole-word where a short word would catch honest mods. */
	private static final Pattern SUSPICIOUS = Pattern.compile(
		"x-?ray|freecam|baritone|meteor-?client|wurst|aristois|^impact$|liquidbounce|inertia|kill-?aura|seed-?crack|chest-?esp|(^|[-_])esp($|[-_])"
			+ "|autoclick|nuker|future-?client|rusherhack|bleachhack|^sigma|tracers?$");

	static void report(ServerPlayerEntity player, ModsPayload payload) {
		REPORTS.put(player.getUuid(), new Report(payload.packKnown(), List.copyOf(payload.mods())));
		long own = payload.mods().stream().filter(ModsPayload.Mod::own).count();
		List<String> flagged = payload.mods().stream().filter(ModReports::suspicious).map(ModsPayload.Mod::id).toList();
		LumaServer.LOG.info("Luma: {} plays with {} mods ({} own){}", player.getName().getString(), payload.mods().size(), own,
			flagged.isEmpty() ? "" : ", suspicious: " + String.join(", ", flagged));
	}

	static void left(ServerPlayerEntity player) {
		REPORTS.remove(player.getUuid());
	}

	private static boolean suspicious(ModsPayload.Mod mod) {
		return SUSPICIOUS.matcher(mod.id().toLowerCase(Locale.ROOT)).find();
	}

	/**
	 * Everyone online, one line of JSON for the admin panel: {"players":[{"name","luma","packKnown",
	 * "count","own":[{"id","v"}],"flagged":[ids]}]}. Only the player's own mods are listed — the
	 * pack's are the same for everyone.
	 */
	static String json(MinecraftServer server) {
		JsonArray players = new JsonArray();
		for (ServerPlayerEntity p : server.getPlayerManager().getPlayerList()) {
			JsonObject o = new JsonObject();
			o.addProperty("name", p.getName().getString());
			Report r = REPORTS.get(p.getUuid());
			o.addProperty("luma", r != null || ServerPlayNetworking.canSend(p, gg.luma.cosmetics.SetPayload.ID));
			o.addProperty("reported", r != null);
			if (r != null) {
				o.addProperty("packKnown", r.packKnown());
				o.addProperty("count", r.mods().size());
				JsonArray own = new JsonArray();
				JsonArray flagged = new JsonArray();
				for (ModsPayload.Mod m : r.mods()) {
					if (suspicious(m)) flagged.add(m.id());
					if (m.own()) {
						JsonObject mod = new JsonObject();
						mod.addProperty("id", m.id());
						mod.addProperty("v", m.version());
						own.add(mod);
					}
				}
				if (r.packKnown()) o.add("own", own);
				o.add("flagged", flagged);
			}
			players.add(o);
		}
		JsonObject root = new JsonObject();
		root.add("players", players);
		return root.toString();
	}

	private ModReports() {}
}
