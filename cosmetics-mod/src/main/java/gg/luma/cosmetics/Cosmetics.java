package gg.luma.cosmetics;

import java.util.Map;
import java.util.Set;

/** The capes, pets, titles, name colors and trails the launcher offers (src/cosmetics.js). Anything else is ignored. */
public final class Cosmetics {
	public static final String MOD_ID = "luma-cosmetics";

	public static final Set<String> CAPES = Set.of("luma", "dawn", "soul", "neon", "lava", "crystal", "night", "star");
	public static final Set<String> PETS = Set.of("fox", "cat", "axolotl", "parrot", "bee", "frog", "rabbit", "chicken");
	/** Shown above the name; the words are in the lang files (luma-cosmetics.title.<id>). Each is
	 * earned in game — server.Titles has what it takes. */
	public static final Set<String> TITLES = Set.of("builder", "miner", "farmer", "explorer", "cook", "warrior", "fisher", "trader", "veteran", "dragonslayer");
	/** Name colors: the launcher's accents (src/accent.js). */
	public static final Map<String, Integer> COLORS = Map.of(
		"luma", 0xD4FF3D, "mint", 0x3DFFA8, "ice", 0x4FE3FF, "violet", 0xB39BFF,
		"pink", 0xFF5FAE, "lava", 0xFF6B3D, "amber", 0xFFB547);
	public static final Set<String> TRAILS = Set.of("sparks", "petals", "snow", "notes", "soul", "hearts");

	/** A player's pick; empty strings mean «none». */
	public record Choice(String cape, String pet) {
		public static final Choice NONE = new Choice("", "");

		/** Unknown ids become «none», so a modified client can't push anything but the list. */
		public Choice sanitized() {
			return new Choice(CAPES.contains(cape) ? cape : "", PETS.contains(pet) ? pet : "");
		}

		public boolean isEmpty() {
			return cape.isEmpty() && pet.isEmpty();
		}
	}

	/** Title, name color and trail; empty strings mean «none». */
	public record Style(String title, String color, String trail) {
		public static final Style NONE = new Style("", "", "");

		public Style sanitized() {
			return new Style(TITLES.contains(title) ? title : "", COLORS.containsKey(color) ? color : "", TRAILS.contains(trail) ? trail : "");
		}

		public boolean isEmpty() {
			return title.isEmpty() && color.isEmpty() && trail.isEmpty();
		}
	}

	/** What others see of a player: their style, and the crown if they're a server operator. */
	public record Shown(Style style, boolean admin) {
		public boolean isEmpty() {
			return style.isEmpty() && !admin;
		}
	}

	private Cosmetics() {}
}
