package gg.luma.cosmetics;

import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import net.fabricmc.api.ModInitializer;
import net.fabricmc.fabric.api.networking.v1.PayloadTypeRegistry;
import net.fabricmc.fabric.api.networking.v1.ServerPlayConnectionEvents;
import net.fabricmc.fabric.api.networking.v1.ServerPlayNetworking;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.network.ServerPlayerEntity;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * The server side: remembers what each online player wears and tells everyone. Purely visual —
 * nothing here touches the world, so it has no effect on PvP or the economy. Each pick and each
 * player who joins without the mod goes to the server log, so «I don't see the pet» can be
 * traced to the server or the client.
 */
public class LumaCosmetics implements ModInitializer {
	private static final Logger LOG = LoggerFactory.getLogger(Cosmetics.MOD_ID);
	/** A client resends every couple of seconds at most; anything faster is dropped, not broadcast. */
	private static final long MIN_GAP_MS = 1000;

	private static final Map<UUID, Cosmetics.Choice> WORN = new ConcurrentHashMap<>();
	private static final Map<UUID, Long> LAST = new ConcurrentHashMap<>();
	/** Players who already got everyone else's picks this connection. */
	private static final Set<UUID> SYNCED = ConcurrentHashMap.newKeySet();

	@Override
	public void onInitialize() {
		PayloadTypeRegistry.playC2S().register(ChoosePayload.ID, ChoosePayload.CODEC);
		PayloadTypeRegistry.playS2C().register(SetPayload.ID, SetPayload.CODEC);

		ServerPlayNetworking.registerGlobalReceiver(ChoosePayload.ID, (payload, context) -> {
			ServerPlayerEntity player = context.player();
			UUID id = player.getUuid();
			long now = System.currentTimeMillis();
			Long last = LAST.get(id);
			if (last != null && now - last < MIN_GAP_MS) return;
			LAST.put(id, now);

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

		ServerPlayConnectionEvents.JOIN.register((handler, sender, server) -> {
			if (!ServerPlayNetworking.canSend(handler.getPlayer(), SetPayload.ID)) {
				LOG.info("Luma Cosmetics: {} joined without the mod, they won't see capes or pets", handler.getPlayer().getName().getString());
			}
		});

		ServerPlayConnectionEvents.DISCONNECT.register((handler, server) -> {
			UUID left = handler.getPlayer().getUuid();
			LAST.remove(left);
			SYNCED.remove(left);
			if (WORN.remove(left) != null) broadcast(server, new SetPayload(left, "", ""));
		});
	}

	private static void broadcast(MinecraftServer server, SetPayload payload) {
		for (ServerPlayerEntity p : server.getPlayerManager().getPlayerList()) {
			if (ServerPlayNetworking.canSend(p, SetPayload.ID)) ServerPlayNetworking.send(p, payload);
		}
	}

	private static String or(String id) {
		return id.isEmpty() ? "none" : id;
	}
}
