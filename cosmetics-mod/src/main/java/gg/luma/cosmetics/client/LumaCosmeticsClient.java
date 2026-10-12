package gg.luma.cosmetics.client;

import gg.luma.cosmetics.ChoosePayload;
import gg.luma.cosmetics.Cosmetics;
import gg.luma.cosmetics.SetPayload;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.networking.v1.C2SPlayChannelEvents;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayConnectionEvents;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import net.fabricmc.fabric.api.client.rendering.v1.WorldRenderEvents;

/**
 * The client side: sends the launcher's pick (-Dluma.cape / -Dluma.pet) once the server can take
 * it, keeps what everyone wears, and draws capes (via the skin textures) and pets.
 */
public class LumaCosmeticsClient implements ClientModInitializer {
	/** What each player on the server wears, the local player included (the server echoes it back). */
	public static final Map<UUID, Cosmetics.Choice> WORN = new ConcurrentHashMap<>();
	private static boolean sent;

	@Override
	public void onInitializeClient() {
		ClientPlayNetworking.registerGlobalReceiver(SetPayload.ID, (payload, context) -> {
			Cosmetics.Choice choice = new Cosmetics.Choice(payload.cape(), payload.pet()).sanitized();
			if (choice.isEmpty()) WORN.remove(payload.player());
			else WORN.put(payload.player(), choice);
		});

		// The server announces its channels a moment after the join; send on whichever comes last.
		ClientPlayConnectionEvents.JOIN.register((handler, sender, client) -> {
			sent = false;
			trySend();
		});
		C2SPlayChannelEvents.REGISTER.register((handler, sender, client, channels) -> {
			if (channels.contains(ChoosePayload.ID.id())) trySend();
		});
		ClientPlayConnectionEvents.DISCONNECT.register((handler, client) -> {
			sent = false;
			WORN.clear();
			Pets.clear();
		});

		ClientTickEvents.END_CLIENT_TICK.register(Pets::tick);
		WorldRenderEvents.AFTER_ENTITIES.register(Pets::render);
	}

	/** The launcher's pick; nothing when the game wasn't started by Luma. */
	static Cosmetics.Choice mine() {
		return new Cosmetics.Choice(System.getProperty("luma.cape", ""), System.getProperty("luma.pet", "")).sanitized();
	}

	private static void trySend() {
		if (sent || !ClientPlayNetworking.canSend(ChoosePayload.ID)) return;
		Cosmetics.Choice c = mine();
		ClientPlayNetworking.send(new ChoosePayload(c.cape(), c.pet()));
		sent = true;
	}
}
