package gg.luma.cosmetics.server;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import net.minecraft.network.packet.s2c.play.PlayerListS2CPacket;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.text.Text;
import net.minecraft.util.Formatting;
import net.minecraft.util.math.Vec3d;

/**
 * «Отошёл»: a player who hasn't turned, walked or chatted for a while. Shown in the Tab list (and so
 * in Luma's pause menu), in the launcher, and left out of «enough players asleep to skip the night».
 */
public final class Afk {
	private static final class State {
		float yaw, pitch;
		Vec3d anchor;
		long lastActive;
		boolean afk;
	}

	private static final Map<UUID, State> STATES = new ConcurrentHashMap<>();
	/** Test hook: -Dluma.afk.seconds=20. */
	private static final long DEFAULT_MS = Long.getLong("luma.afk.seconds", 0) * 1000;

	static long afterMs() {
		return DEFAULT_MS > 0 ? DEFAULT_MS : LumaServer.config().afkMinutes * 60_000L;
	}

	public static boolean isAfk(ServerPlayerEntity player) {
		State s = STATES.get(player.getUuid());
		return s != null && s.afk;
	}

	/** Minutes since they went quiet, for the launcher; 0 when they're here. */
	static long afkMinutes(ServerPlayerEntity player) {
		State s = STATES.get(player.getUuid());
		return s != null && s.afk ? (System.currentTimeMillis() - s.lastActive) / 60_000 : 0;
	}

	/** Once a second: whoever turned or walked off is here; whoever didn't for long enough is away. */
	static void tick(MinecraftServer server) {
		long now = System.currentTimeMillis();
		for (ServerPlayerEntity p : server.getPlayerManager().getPlayerList()) {
			State s = STATES.computeIfAbsent(p.getUuid(), id -> {
				State fresh = new State();
				fresh.yaw = p.getYaw();
				fresh.pitch = p.getPitch();
				fresh.anchor = p.getPos();
				fresh.lastActive = now;
				return fresh;
			});
			boolean turned = Math.abs(p.getYaw() - s.yaw) > 0.5f || Math.abs(p.getPitch() - s.pitch) > 0.5f;
			boolean walked = p.getPos().squaredDistanceTo(s.anchor) > 2.25;
			s.yaw = p.getYaw();
			s.pitch = p.getPitch();
			if (turned || walked) {
				s.anchor = p.getPos();
				s.lastActive = now;
				if (s.afk) set(server, p, s, false);
			} else if (!s.afk && now - s.lastActive >= afterMs()) {
				set(server, p, s, true);
			}
		}
	}

	/** Chat counts as being here. */
	static void active(ServerPlayerEntity player) {
		State s = STATES.get(player.getUuid());
		if (s == null) return;
		s.lastActive = System.currentTimeMillis();
		if (s.afk) set(player.getServer(), player, s, false);
	}

	/** /afk: away right now, until they move. */
	static void goAway(ServerPlayerEntity player) {
		State s = STATES.get(player.getUuid());
		if (s == null || s.afk) return;
		// Away from now on: the launcher counts their minutes from here.
		s.lastActive = System.currentTimeMillis();
		s.anchor = player.getPos();
		set(player.getServer(), player, s, true);
	}

	static void left(ServerPlayerEntity player) {
		STATES.remove(player.getUuid());
	}

	private static void set(MinecraftServer server, ServerPlayerEntity p, State s, boolean afk) {
		s.afk = afk;
		server.getPlayerManager().sendToAll(new PlayerListS2CPacket(PlayerListS2CPacket.Action.UPDATE_DISPLAY_NAME, p));
		// The «players asleep» count leaves out the away ones (ServerWorldMixin): recount now.
		for (ServerWorld world : server.getWorlds()) world.updateSleepingPlayers();
		p.sendMessage(Text.literal(afk ? "Ты отошёл — на сервере это видно. Пошевелись, чтобы вернуться." : "С возвращением!").formatted(Formatting.GRAY), true);
		LumaServer.publishOnline(server);
	}

	/** The Tab name while away (ServerPlayerEntityMixin): «Rimfyy · отошёл», the suffix in grey. */
	public static Text listName(ServerPlayerEntity player, Text current) {
		Text base = current != null ? current : Text.literal(player.getName().getString());
		return base.copy().append(Text.literal(" · отошёл").formatted(Formatting.GRAY));
	}

	private Afk() {}
}
