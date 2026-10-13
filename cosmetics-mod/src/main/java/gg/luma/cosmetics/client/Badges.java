package gg.luma.cosmetics.client;

import gg.luma.cosmetics.Cosmetics;
import java.util.UUID;
import net.minecraft.text.MutableText;
import net.minecraft.text.Text;

/** How a player's name reads to others: a crown for admins, their name color, their title. */
public final class Badges {
	private static final int CROWN = 0xFFB547;
	private static final int TITLE = 0xA9AFA6;

	/** The name with the crown and color, or the name as it was. */
	public static Text name(UUID player, Text name) {
		Cosmetics.Shown shown = LumaCosmeticsClient.SHOWN.get(player);
		if (shown == null || shown.isEmpty()) return name;
		Integer color = Cosmetics.COLORS.get(shown.style().color());
		MutableText out = Text.empty();
		if (shown.admin()) out.append(Text.literal("♛ ").withColor(CROWN));
		out.append(color == null ? name : name.copy().withColor(color));
		return out;
	}

	/** The title above the name, or null. */
	public static Text title(UUID player) {
		Cosmetics.Shown shown = LumaCosmeticsClient.SHOWN.get(player);
		if (shown == null || shown.style().title().isEmpty()) return null;
		return Text.translatable("luma-cosmetics.title." + shown.style().title()).withColor(TITLE);
	}

	private Badges() {}
}
