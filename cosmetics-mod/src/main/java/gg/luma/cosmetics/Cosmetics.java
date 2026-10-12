package gg.luma.cosmetics;

import java.util.Set;

/** The capes and pets the launcher offers (src/cosmetics.js). Anything else is ignored. */
public final class Cosmetics {
	public static final String MOD_ID = "luma-cosmetics";

	public static final Set<String> CAPES = Set.of("luma", "dawn", "soul", "neon", "lava", "crystal", "night", "star");
	public static final Set<String> PETS = Set.of("fox", "cat", "axolotl", "parrot", "bee", "frog", "rabbit", "chicken");

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

	private Cosmetics() {}
}
