package gg.luma.cosmetics.client;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import gg.luma.cosmetics.ChoosePayload;
import gg.luma.cosmetics.Cosmetics;
import gg.luma.cosmetics.SetPayload;
import java.nio.file.Files;
import java.nio.file.NoSuchFileException;
import java.nio.file.Path;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayConnectionEvents;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import net.fabricmc.fabric.api.client.rendering.v1.WorldRenderEvents;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.MinecraftClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * The client side: tells the server what the player wears, keeps what everyone wears, and draws
 * capes (via the skin textures) and pets. The pick comes from the launcher — config/luma-cosmetics.json,
 * reread every two seconds so the wardrobe works in a running game, or -Dluma.cape / -Dluma.pet
 * from launchers older than that file.
 */
public class LumaCosmeticsClient implements ClientModInitializer {
	/** What each player on the server wears, the local player included (the server echoes it back). */
	public static final Map<UUID, Cosmetics.Choice> WORN = new ConcurrentHashMap<>();
	static final Logger LOG = LoggerFactory.getLogger(Cosmetics.MOD_ID);
	private static final Path LOOK = FabricLoader.getInstance().getConfigDir().resolve("luma-cosmetics.json");
	private static final int EVERY = 40;
	/** Resends of an unanswered pick before giving up until it changes. */
	private static final int RETRIES = 3;

	/** What this connection last told the server; null — nothing yet. */
	private static Cosmetics.Choice sent;
	private static boolean answered, noMod;
	private static int ticks, unanswered;
	private static long lookStamp = Long.MIN_VALUE;
	private static Cosmetics.Choice fromFile;

	@Override
	public void onInitializeClient() {
		ClientPlayNetworking.registerGlobalReceiver(SetPayload.ID, (payload, context) -> {
			Cosmetics.Choice choice = new Cosmetics.Choice(payload.cape(), payload.pet()).sanitized();
			if (choice.isEmpty()) WORN.remove(payload.player());
			else WORN.put(payload.player(), choice);
			if (payload.player().equals(context.player().getUuid())) answered = true;
		});

		ClientPlayConnectionEvents.JOIN.register((handler, sender, client) -> reset());
		ClientPlayConnectionEvents.DISCONNECT.register((handler, client) -> {
			reset();
			WORN.clear();
			Pets.clear();
		});

		ClientTickEvents.END_CLIENT_TICK.register(client -> {
			Pets.tick(client);
			share(client);
		});
		WorldRenderEvents.AFTER_ENTITIES.register(Pets::render);
	}

	private static void reset() {
		sent = null;
		answered = noMod = false;
		ticks = unanswered = 0;
	}

	/**
	 * Every two seconds on a server: sends the pick when it changed, and again while the server
	 * hasn't echoed it — a packet sent in the first moments of a join can go nowhere.
	 */
	private static void share(MinecraftClient client) {
		if (client.player == null || client.getNetworkHandler() == null || ++ticks % EVERY != 0) return;
		if (!ClientPlayNetworking.canSend(ChoosePayload.ID)) {
			if (!noMod && ticks >= EVERY * 5) {
				noMod = true;
				LOG.info("Luma Cosmetics: the server doesn't have the mod, capes and pets stay off here");
			}
			return;
		}
		Cosmetics.Choice now = mine();
		if (now.equals(sent)) {
			if (answered || unanswered >= RETRIES) return;
			unanswered++;
		} else {
			LOG.info("Luma Cosmetics: wearing cape={} pet={}", or(now.cape()), or(now.pet()));
			unanswered = 0;
		}
		ClientPlayNetworking.send(new ChoosePayload(now.cape(), now.pet()));
		sent = now;
		answered = false;
	}

	/** The launcher's pick: its file, or the launch flags; nothing when the game wasn't started by Luma. */
	static Cosmetics.Choice mine() {
		Cosmetics.Choice file = readLook();
		if (file != null) return file;
		return new Cosmetics.Choice(System.getProperty("luma.cape", ""), System.getProperty("luma.pet", "")).sanitized();
	}

	private static Cosmetics.Choice readLook() {
		try {
			long stamp = Files.getLastModifiedTime(LOOK).toMillis();
			if (stamp != lookStamp) {
				JsonObject o = JsonParser.parseString(Files.readString(LOOK)).getAsJsonObject();
				fromFile = new Cosmetics.Choice(text(o, "cape"), text(o, "pet")).sanitized();
				lookStamp = stamp;
			}
			return fromFile;
		} catch (NoSuchFileException e) {
			return null;
		} catch (Exception e) {
			// Mid-write or hand-edited into nonsense: keep the last good pick, try again next time.
			return fromFile;
		}
	}

	private static String text(JsonObject o, String key) {
		return o.has(key) && o.get(key).isJsonPrimitive() ? o.get(key).getAsString() : "";
	}

	static String or(String id) {
		return id.isEmpty() ? "none" : id;
	}
}
