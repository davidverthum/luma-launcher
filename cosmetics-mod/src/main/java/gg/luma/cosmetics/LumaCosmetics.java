package gg.luma.cosmetics;

import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import net.fabricmc.api.ModInitializer;
import net.fabricmc.fabric.api.networking.v1.PayloadTypeRegistry;
import net.fabricmc.fabric.api.networking.v1.ServerPlayConnectionEvents;
import net.fabricmc.fabric.api.networking.v1.ServerPlayNetworking;
import net.minecraft.network.packet.CustomPayload;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.network.ServerPlayerEntity;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * The server side: remembers what each online player wears and tells everyone. Purely visual —
 * nothing here touches the world, so it has no effect on PvP or the economy. Each pick and each
 * player who joins without the mod goes to the server log, so «I don't see the pet» can be
 * traced to the server or the client.
 *
 * Since 1.1: titles, name colors and trails (their own channel, so 1.0 clients and servers keep
 * working), a crown for server operators, and the leaderboard the launcher shows.
 */
public class LumaCosmetics implements ModInitializer {
	private static final Logger LOG = LoggerFactory.getLogger(Cosmetics.MOD_ID);
	/** A client resends every couple of seconds at most; anything faster is dropped, not broadcast. */
	private static final long MIN_GAP_MS = 1000;
	/** The leaderboard is asked for every few minutes; more often gets the cached one or nothing. */
	private static final long BOARD_GAP_MS = 20_000;

	private static final Map<UUID, Cosmetics.Choice> WORN = new ConcurrentHashMap<>();
	private static final Map<UUID, Cosmetics.Shown> SHOWN = new ConcurrentHashMap<>();
	private static final Map<UUID, Long> LAST = new ConcurrentHashMap<>();
	private static final Map<UUID, Long> LAST_STYLE = new ConcurrentHashMap<>();
	private static final Map<UUID, Long> LAST_BOARD = new ConcurrentHashMap<>();
	/** Players who already got everyone else's picks this connection. */
	private static final Set<UUID> SYNCED = ConcurrentHashMap.newKeySet();

	@Override
	public void onInitialize() {
		PayloadTypeRegistry.playC2S().register(ChoosePayload.ID, ChoosePayload.CODEC);
		PayloadTypeRegistry.playS2C().register(SetPayload.ID, SetPayload.CODEC);
		PayloadTypeRegistry.playC2S().register(StylePayload.ID, StylePayload.CODEC);
		PayloadTypeRegistry.playS2C().register(StyleSetPayload.ID, StyleSetPayload.CODEC);
		PayloadTypeRegistry.playC2S().register(BoardRequestPayload.ID, BoardRequestPayload.CODEC);
		PayloadTypeRegistry.playS2C().register(BoardPayload.ID, BoardPayload.CODEC);

		ServerPlayNetworking.registerGlobalReceiver(ChoosePayload.ID, (payload, context) -> {
			ServerPlayerEntity player = context.player();
			UUID id = player.getUuid();
			if (tooSoon(LAST, id, MIN_GAP_MS)) return;

			Cosmetics.Choice choice = new Cosmetics.Choice(payload.cape(), payload.pet()).sanitized();
			Cosmetics.Choice before = choice.isEmpty() ? WORN.remove(id) : WORN.put(id, choice);
			if (!choice.equals(before == null ? Cosmetics.Choice.NONE : before)) {
				LOG.info("Luma Cosmetics: {} wears cape={} pet={}", player.getName().getString(), or(choice.cape()), or(choice.pet()));
			}
			// Their own pick back to them too: that echo is how the client knows it arrived.
			broadcast(context.server(), new SetPayload(id, choice.cape(), choice.pet()));
			// Whoever just arrived learns what everyone already online wears.
			if (SYNCED.add(id)) {
				WORN.forEach((other, c) -> {
					if (!other.equals(id)) ServerPlayNetworking.send(player, new SetPayload(other, c.cape(), c.pet()));
				});
			}
		});

		ServerPlayNetworking.registerGlobalReceiver(StylePayload.ID, (payload, context) -> {
			ServerPlayerEntity player = context.player();
			if (tooSoon(LAST_STYLE, player.getUuid(), MIN_GAP_MS)) return;
			Cosmetics.Style style = new Cosmetics.Style(payload.title(), payload.color(), payload.trail()).sanitized();
			Cosmetics.Shown shown = new Cosmetics.Shown(style, isAdmin(context.server(), player));
			Cosmetics.Shown before = SHOWN.put(player.getUuid(), shown);
			if (!shown.equals(before)) {
				LOG.info("Luma Cosmetics: {} styles title={} color={} trail={}", player.getName().getString(), or(style.title()), or(style.color()), or(style.trail()));
			}
			broadcast(context.server(), StyleSetPayload.of(player.getUuid(), shown));
		});

		ServerPlayNetworking.registerGlobalReceiver(BoardRequestPayload.ID, (payload, context) -> {
			if (tooSoon(LAST_BOARD, context.player().getUuid(), BOARD_GAP_MS)) return;
			context.responseSender().sendPacket(new BoardPayload(Board.get(context.server())));
		});

		ServerPlayConnectionEvents.JOIN.register((handler, sender, server) -> {
			ServerPlayerEntity player = handler.getPlayer();
			if (!ServerPlayNetworking.canSend(player, SetPayload.ID)) {
				LOG.info("Luma Cosmetics: {} joined without the mod, they won't see capes or pets", player.getName().getString());
			}
			// Styles and crowns of those already here; an admin's crown shows before they pick anything.
			if (ServerPlayNetworking.canSend(player, StyleSetPayload.ID)) {
				SHOWN.forEach((other, shown) -> ServerPlayNetworking.send(player, StyleSetPayload.of(other, shown)));
			}
			if (isAdmin(server, player) && !SHOWN.containsKey(player.getUuid())) {
				Cosmetics.Shown shown = new Cosmetics.Shown(Cosmetics.Style.NONE, true);
				SHOWN.put(player.getUuid(), shown);
				broadcast(server, StyleSetPayload.of(player.getUuid(), shown));
			}
		});

		ServerPlayConnectionEvents.DISCONNECT.register((handler, server) -> {
			UUID left = handler.getPlayer().getUuid();
			LAST.remove(left);
			LAST_STYLE.remove(left);
			LAST_BOARD.remove(left);
			SYNCED.remove(left);
			if (WORN.remove(left) != null) broadcast(server, new SetPayload(left, "", ""));
			if (SHOWN.remove(left) != null) broadcast(server, StyleSetPayload.of(left, new Cosmetics.Shown(Cosmetics.Style.NONE, false)));
		});
	}

	/** Operators get the crown: whoever runs the server decides who's an admin, not the client. */
	private static boolean isAdmin(MinecraftServer server, ServerPlayerEntity player) {
		return server.getPlayerManager().isOperator(player.getGameProfile());
	}

	private static boolean tooSoon(Map<UUID, Long> last, UUID id, long gap) {
		long now = System.currentTimeMillis();
		Long before = last.get(id);
		if (before != null && now - before < gap) return true;
		last.put(id, now);
		return false;
	}

	private static void broadcast(MinecraftServer server, CustomPayload payload) {
		for (ServerPlayerEntity p : server.getPlayerManager().getPlayerList()) {
			if (ServerPlayNetworking.canSend(p, payload.getId())) ServerPlayNetworking.send(p, payload);
		}
	}

	private static String or(String id) {
		return id.isEmpty() ? "none" : id;
	}
}
