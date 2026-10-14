package gg.luma.cosmetics.server;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.text.Text;
import net.minecraft.util.math.BlockPos;

/**
 * Places players put on the server map: «База Rimfyy», «Ферма», «Портал в Незер». /mark add <name>
 * marks where you stand; they show on BlueMap (MapGlue), in the launcher's map tab and its
 * chronicle. Kept in world/luma/places.json.
 */
public final class Places {
	public record Place(String id, String name, String owner, UUID ownerId, String dim, int x, int y, int z, long t) {}

	static final int PER_PLAYER = 15;
	static final int MAX_NAME = 32;
	private static final List<Place> ALL = new CopyOnWriteArrayList<>();
	private static MinecraftServer server;

	static List<Place> all() {
		return List.copyOf(ALL);
	}

	static void load(MinecraftServer s) {
		server = s;
		ALL.clear();
		JsonElement saved = Store.read(s, "places.json");
		if (saved != null && saved.isJsonArray()) {
			for (JsonElement e : saved.getAsJsonArray()) {
				try {
					JsonObject o = e.getAsJsonObject();
					ALL.add(new Place(o.get("id").getAsString(), o.get("name").getAsString(), o.get("owner").getAsString(),
						UUID.fromString(o.get("ownerId").getAsString()), o.get("dim").getAsString(),
						o.get("x").getAsInt(), o.get("y").getAsInt(), o.get("z").getAsInt(), o.get("t").getAsLong()));
				} catch (RuntimeException skip) {
					// A hand-edited entry that doesn't parse: leave it out.
				}
			}
		}
		publish();
	}

	/** Marks where the player stands; the same name of theirs moves instead of doubling. Null — done; else why not. */
	static Text add(ServerPlayerEntity player, String rawName) {
		String name = clean(rawName);
		if (name.isEmpty()) return Text.literal("Напиши название места: /mark add Ферма");
		if (name.length() > MAX_NAME) return Text.literal("Слишком длинное название — до " + MAX_NAME + " символов.");
		UUID me = player.getUuid();
		Place mine = ALL.stream().filter(p -> p.ownerId().equals(me) && p.name().equalsIgnoreCase(name)).findFirst().orElse(null);
		if (mine == null && ALL.stream().filter(p -> p.ownerId().equals(me)).count() >= PER_PLAYER) {
			return Text.literal("У тебя уже " + PER_PLAYER + " мест — убери лишнее: /mark remove <название>");
		}
		BlockPos at = player.getBlockPos();
		Place place = new Place(mine != null ? mine.id() : UUID.randomUUID().toString().substring(0, 8), name, player.getName().getString(), me,
			player.getServerWorld().getRegistryKey().getValue().toString(), at.getX(), at.getY(), at.getZ(), System.currentTimeMillis());
		if (mine != null) ALL.remove(mine);
		ALL.add(place);
		changed();
		if (mine == null) {
			Chronicle.add(server, "place", player.getName().getString(),
				Text.translatableWithFallback("luma.chronicle.place", "%s отметил место на карте: %s", player.getName().getString(), name),
				place.dim(), at);
		}
		return null;
	}

	/** Your own place by name; an operator can remove anyone's. Null — removed; else why not. */
	static Text remove(ServerPlayerEntity player, boolean op, String rawName) {
		String name = clean(rawName);
		Place found = ALL.stream().filter(p -> p.name().equalsIgnoreCase(name) && (player == null || p.ownerId().equals(player.getUuid()))).findFirst()
			.or(() -> op ? ALL.stream().filter(p -> p.name().equalsIgnoreCase(name)).findFirst() : java.util.Optional.empty())
			.orElse(null);
		if (found == null) return Text.literal("Места «" + name + "» у тебя нет. Список: /mark list");
		ALL.remove(found);
		changed();
		return null;
	}

	static List<String> lines() {
		List<String> out = new ArrayList<>();
		for (Place p : ALL) out.add("• " + p.name() + " — " + p.owner() + " (" + dimName(p.dim()) + ", " + p.x() + " " + p.y() + " " + p.z() + ")");
		return out;
	}

	private static void changed() {
		save();
		publish();
		if (server != null && LumaServer.blueMap()) MapGlue.sync(server);
	}

	private static void save() {
		if (server != null) Store.write(server, "places.json", json());
	}

	private static void publish() {
		JsonObject o = new JsonObject();
		o.addProperty("updated", System.currentTimeMillis());
		o.add("places", json());
		Web.publish("places.json", o);
	}

	private static JsonArray json() {
		JsonArray arr = new JsonArray();
		for (Place p : ALL) {
			JsonObject o = new JsonObject();
			o.addProperty("id", p.id());
			o.addProperty("name", p.name());
			o.addProperty("owner", p.owner());
			o.addProperty("ownerId", p.ownerId().toString());
			o.addProperty("dim", p.dim());
			o.addProperty("x", p.x());
			o.addProperty("y", p.y());
			o.addProperty("z", p.z());
			o.addProperty("t", p.t());
			arr.add(o);
		}
		return arr;
	}

	/** Plain text: no formatting codes, no line breaks, single spaces. */
	private static String clean(String s) {
		return s == null ? "" : s.replaceAll("§.", "").replaceAll("[\\p{Cntrl}]", " ").replaceAll("\\s+", " ").trim();
	}

	static String dimName(String dim) {
		return switch (dim.toLowerCase(Locale.ROOT)) {
			case "minecraft:overworld" -> "обычный мир";
			case "minecraft:the_nether" -> "Незер";
			case "minecraft:the_end" -> "Энд";
			default -> dim;
		};
	}

	private Places() {}
}
