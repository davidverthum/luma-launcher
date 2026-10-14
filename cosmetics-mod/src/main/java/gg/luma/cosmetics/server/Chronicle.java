package gg.luma.cosmetics.server;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.HashSet;
import java.util.Set;
import net.minecraft.advancement.AdvancementDisplay;
import net.minecraft.advancement.AdvancementEntry;
import net.minecraft.advancement.AdvancementFrame;
import net.minecraft.entity.EntityType;
import net.minecraft.entity.LivingEntity;
import net.minecraft.entity.damage.DamageSource;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.text.Text;
import net.minecraft.util.WorldSavePath;
import net.minecraft.util.math.BlockPos;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * The server's chronicle for the launcher: first visits, advancements worth telling, deaths, bosses,
 * new places on the map. Each line is kept as Minecraft's own text (JSON, translation keys and all),
 * so the launcher shows it in Russian with the game's own words — «Rimfyy попытался поплавать в лаве».
 * The last events live in world/luma/chronicle.json and go out as luma/chronicle.json.
 */
public final class Chronicle {
	private static final Logger LOG = LoggerFactory.getLogger("luma-cosmetics");
	private static final int KEEP = 300;
	private static final int PUBLISH = 150;
	/** Tasks worth a line besides every goal and challenge. */
	private static final Set<String> STORY = Set.of(
		"minecraft:story/mine_diamond", "minecraft:story/enter_the_nether", "minecraft:story/enter_the_end",
		"minecraft:story/follow_ender_eye", "minecraft:nether/find_fortress", "minecraft:nether/find_bastion",
		"minecraft:nether/obtain_ancient_debris", "minecraft:end/find_end_city", "minecraft:adventure/trade",
		"minecraft:husbandry/tame_an_animal", "minecraft:adventure/sleep_in_bed");
	private static final Set<EntityType<?>> BOSSES = Set.of(EntityType.ENDER_DRAGON, EntityType.WITHER, EntityType.WARDEN, EntityType.ELDER_GUARDIAN);

	private static final Deque<JsonObject> EVENTS = new ArrayDeque<>();
	private static final Set<String> SEEN = new HashSet<>();
	private static MinecraftServer server;

	static synchronized void load(MinecraftServer s) {
		server = s;
		EVENTS.clear();
		JsonElement saved = Store.read(s, "chronicle.json");
		if (saved != null && saved.isJsonArray()) {
			for (JsonElement e : saved.getAsJsonArray()) if (e.isJsonObject()) EVENTS.addLast(e.getAsJsonObject());
		}
		SEEN.clear();
		JsonElement seen = Store.read(s, "seen.json");
		if (seen != null && seen.isJsonArray()) {
			seen.getAsJsonArray().forEach(e -> SEEN.add(e.getAsString()));
		} else {
			// First run on a world people already play: they aren't «new», whoever has statistics.
			Path stats = s.getSavePath(WorldSavePath.STATS);
			if (Files.isDirectory(stats)) {
				try (DirectoryStream<Path> files = Files.newDirectoryStream(stats, "*.json")) {
					for (Path f : files) SEEN.add(f.getFileName().toString().replace(".json", ""));
				} catch (Exception e) {
					LOG.warn("Luma: couldn't read who played before", e);
				}
			}
			saveSeen();
		}
		publish();
	}

	/** One line for the chronicle. `dim`/`pos` — where it happened, for «на карте»; may be null. */
	static synchronized void add(MinecraftServer s, String kind, String player, Text text, String dim, BlockPos pos) {
		if (s == null) return;
		JsonObject o = new JsonObject();
		o.addProperty("t", System.currentTimeMillis());
		o.addProperty("kind", kind);
		o.addProperty("player", player);
		o.addProperty("msg", Text.Serialization.toJsonString(text, s.getRegistryManager()));
		o.addProperty("plain", text.getString());
		if (dim != null && pos != null) {
			o.addProperty("dim", dim);
			o.addProperty("x", pos.getX());
			o.addProperty("y", pos.getY());
			o.addProperty("z", pos.getZ());
		}
		EVENTS.addLast(o);
		while (EVENTS.size() > KEEP) EVENTS.removeFirst();
		JsonArray all = new JsonArray();
		EVENTS.forEach(all::add);
		Store.write(s, "chronicle.json", all);
		publish();
	}

	static void joined(ServerPlayerEntity player) {
		String id = player.getUuid().toString();
		boolean first;
		synchronized (Chronicle.class) {
			first = SEEN.add(id);
			if (first) saveSeen();
		}
		if (first) {
			String name = player.getName().getString();
			add(server, "first_join", name, Text.translatableWithFallback("luma.chronicle.first_join", "%s впервые зашёл на сервер", name), null, null);
		}
	}

	/** An advancement was just completed (PlayerAdvancementTrackerMixin): goals, challenges and a few tasks. */
	public static void advancement(ServerPlayerEntity player, AdvancementEntry entry) {
		AdvancementDisplay display = entry.value().display().orElse(null);
		if (display == null) return;
		boolean worth = display.getFrame() != AdvancementFrame.TASK || STORY.contains(entry.id().toString());
		if (!worth) return;
		add(player.getServer(), "advancement", player.getName().getString(), display.getFrame().getChatAnnouncementText(entry, player), null, null);
	}

	/** Deaths of players, and bosses beaten by one. */
	static void died(LivingEntity entity, DamageSource source) {
		if (entity instanceof ServerPlayerEntity player) {
			add(player.getServer(), "death", player.getName().getString(), source.getDeathMessage(player),
				player.getServerWorld().getRegistryKey().getValue().toString(), player.getBlockPos());
		} else if (BOSSES.contains(entity.getType()) && entity.getPrimeAdversary() instanceof ServerPlayerEntity hero) {
			String name = hero.getName().getString();
			add(hero.getServer(), "boss", name, Text.translatableWithFallback("luma.chronicle.boss", "%s одолел босса: %s", name, entity.getName()),
				entity.getWorld().getRegistryKey().getValue().toString(), entity.getBlockPos());
		}
	}

	private static void saveSeen() {
		if (server == null) return;
		JsonArray arr = new JsonArray();
		SEEN.forEach(arr::add);
		Store.write(server, "seen.json", arr);
	}

	private static void publish() {
		JsonObject o = new JsonObject();
		o.addProperty("updated", System.currentTimeMillis());
		JsonArray events = new JsonArray();
		EVENTS.stream().skip(Math.max(0, EVENTS.size() - PUBLISH)).forEach(events::add);
		o.add("events", events);
		Web.publish("chronicle.json", o);
	}

	private Chronicle() {}
}
