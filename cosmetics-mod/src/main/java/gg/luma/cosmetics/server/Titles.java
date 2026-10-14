package gg.luma.cosmetics.server;

import gg.luma.cosmetics.Board;
import gg.luma.cosmetics.TitlesPayload;
import java.util.ArrayList;
import java.util.List;
import java.util.function.ToLongFunction;
import net.minecraft.advancement.AdvancementEntry;
import net.minecraft.block.Block;
import net.minecraft.block.Blocks;
import net.minecraft.component.DataComponentTypes;
import net.minecraft.item.BlockItem;
import net.minecraft.item.Item;
import net.minecraft.registry.Registries;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.stat.ServerStatHandler;
import net.minecraft.stat.Stats;
import net.minecraft.util.Identifier;

/**
 * Titles are earned: each has a goal in Minecraft's own statistics (or an advancement), counted on
 * the server — the client can't claim one it hasn't got. The wardrobe shows how far along you are.
 */
public final class Titles {
	record Rule(String id, long need, ToLongFunction<ServerPlayerEntity> have) {}

	private static final long HOUR = 20L * 60 * 60;
	private static final Identifier DRAGON = Identifier.of("minecraft", "end/kill_dragon");
	private static final List<Rule> RULES = List.of(
		new Rule("builder", 5000, p -> sum(p, blockItems(), Stats.USED)),
		new Rule("miner", 50, p -> mined(p.getStatHandler(), Board.DIAMOND_ORES)),
		new Rule("farmer", 500, p -> mined(p.getStatHandler(), crops())),
		new Rule("explorer", 100L * 100_000, p -> travel(p.getStatHandler())),
		new Rule("cook", 100, p -> sum(p, foods(), Stats.CRAFTED)),
		new Rule("warrior", 500, p -> p.getStatHandler().getStat(Stats.CUSTOM.getOrCreateStat(Stats.MOB_KILLS))),
		new Rule("fisher", 100, p -> p.getStatHandler().getStat(Stats.CUSTOM.getOrCreateStat(Stats.FISH_CAUGHT))),
		new Rule("trader", 50, p -> p.getStatHandler().getStat(Stats.CUSTOM.getOrCreateStat(Stats.TRADED_WITH_VILLAGER))),
		new Rule("veteran", 100 * HOUR, p -> p.getStatHandler().getStat(Stats.CUSTOM.getOrCreateStat(Stats.PLAY_TIME))),
		new Rule("dragonslayer", 1, Titles::dragon));

	private static List<Item> blockItems, foods;
	private static List<Block> crops;

	/** How far the player is towards every title. */
	public static List<TitlesPayload.Progress> progress(ServerPlayerEntity player) {
		List<TitlesPayload.Progress> out = new ArrayList<>();
		for (Rule r : RULES) out.add(new TitlesPayload.Progress(r.id(), Math.min(r.have().applyAsLong(player), r.need()), r.need()));
		return out;
	}

	public static boolean unlocked(ServerPlayerEntity player, String id) {
		for (Rule r : RULES) if (r.id().equals(id)) return r.have().applyAsLong(player) >= r.need();
		return false;
	}

	private static long sum(ServerPlayerEntity p, List<Item> items, net.minecraft.stat.StatType<Item> type) {
		ServerStatHandler stats = p.getStatHandler();
		long n = 0;
		for (Item item : items) n += stats.getStat(type.getOrCreateStat(item));
		return n;
	}

	private static long mined(ServerStatHandler stats, List<Block> blocks) {
		long n = 0;
		for (Block b : blocks) n += stats.getStat(Stats.MINED.getOrCreateStat(b));
		return n;
	}

	private static long travel(ServerStatHandler stats) {
		long n = 0;
		for (Identifier id : Board.TRAVEL) n += stats.getStat(Stats.CUSTOM.getOrCreateStat(id));
		return n;
	}

	private static long dragon(ServerPlayerEntity p) {
		AdvancementEntry entry = p.getServer().getAdvancementLoader().get(DRAGON);
		return entry != null && p.getAdvancementTracker().getProgress(entry).isDone() ? 1 : 0;
	}

	private static List<Item> blockItems() {
		if (blockItems == null) blockItems = Registries.ITEM.stream().filter(i -> i instanceof BlockItem).toList();
		return blockItems;
	}

	private static List<Item> foods() {
		if (foods == null) foods = Registries.ITEM.stream().filter(i -> i.getComponents().contains(DataComponentTypes.FOOD)).toList();
		return foods;
	}

	/** Vanilla crops, and Farmer's Delight's when the pack has it. */
	private static List<Block> crops() {
		if (crops == null) {
			List<Block> list = new ArrayList<>(List.of(Blocks.WHEAT, Blocks.CARROTS, Blocks.POTATOES, Blocks.BEETROOTS, Blocks.NETHER_WART,
				Blocks.MELON, Blocks.PUMPKIN, Blocks.COCOA, Blocks.SUGAR_CANE));
			for (String fd : List.of("cabbages", "tomatoes", "onions", "rice_panicles")) {
				Registries.BLOCK.getOrEmpty(Identifier.of("farmersdelight", fd)).ifPresent(list::add);
			}
			crops = list;
		}
		return crops;
	}

	private Titles() {}
}
