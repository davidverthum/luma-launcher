package gg.luma.cosmetics;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import net.fabricmc.api.ModInitializer;
import net.fabricmc.fabric.api.networking.v1.PayloadTypeRegistry;
import net.fabricmc.fabric.api.networking.v1.ServerPlayConnectionEvents;
import net.fabricmc.fabric.api.networking.v1.ServerPlayNetworking;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.network.ServerPlayerEntity;

/**
 * The server side: remembers what each online player wears and tells everyone. Purely visual —
 * nothing here touches the world, so it has no effect on PvP or the economy.
 */
public class LumaCosmetics implements ModInitializer {
	private static final Map<UUID, Cosmetics.Choice> WORN = new ConcurrentHashMap<>();

	@Override
	public void onInitialize() {
		PayloadTypeRegistry.playC2S().register(ChoosePayload.ID, ChoosePayload.CODEC);
		PayloadTypeRegistry.playS2C().register(SetPayload.ID, SetPayload.CODEC);

		ServerPlayNetworking.registerGlobalReceiver(ChoosePayload.ID, (payload, context) -> {
			ServerPlayerEntity player = context.player();
			Cosmetics.Choice choice = new Cosmetics.Choice(payload.cape(), payload.pet()).sanitized();
			if (choice.isEmpty()) WORN.remove(player.getUuid());
			else WORN.put(player.getUuid(), choice);
			broadcast(context.server(), new SetPayload(player.getUuid(), choice.cape(), choice.pet()));
		});

		// Whoever joins learns what everyone already online wears.
		ServerPlayConnectionEvents.JOIN.register((handler, sender, server) -> {
			ServerPlayerEntity joined = handler.getPlayer();
			if (!ServerPlayNetworking.canSend(joined, SetPayload.ID)) return;
			WORN.forEach((uuid, c) -> ServerPlayNetworking.send(joined, new SetPayload(uuid, c.cape(), c.pet())));
		});

		ServerPlayConnectionEvents.DISCONNECT.register((handler, server) -> {
			UUID left = handler.getPlayer().getUuid();
			if (WORN.remove(left) != null) broadcast(server, new SetPayload(left, "", ""));
		});
	}

	private static void broadcast(MinecraftServer server, SetPayload payload) {
		for (ServerPlayerEntity p : server.getPlayerManager().getPlayerList()) {
			if (ServerPlayNetworking.canSend(p, SetPayload.ID)) ServerPlayNetworking.send(p, payload);
		}
	}
}
