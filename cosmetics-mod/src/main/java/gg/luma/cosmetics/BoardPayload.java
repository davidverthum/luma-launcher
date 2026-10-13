package gg.luma.cosmetics;

import java.util.ArrayList;
import java.util.List;
import net.minecraft.network.RegistryByteBuf;
import net.minecraft.network.codec.PacketCodec;
import net.minecraft.network.codec.PacketCodecs;
import net.minecraft.network.packet.CustomPayload;
import net.minecraft.util.Identifier;

/** Server → client: everyone's numbers for the launcher's leaderboard. */
public record BoardPayload(List<Entry> entries) implements CustomPayload {
	public static final Id<BoardPayload> ID = new Id<>(Identifier.of(Cosmetics.MOD_ID, "board"));
	/** More than a friends' server will ever have; caps what a server can make a client hold. */
	public static final int MAX = 200;

	/** Play time in ticks, travel in centimetres — the units of Minecraft's own statistics. */
	public record Entry(String name, long playTicks, int deaths, int mobKills, long distanceCm, int diamonds) {
		public static final PacketCodec<RegistryByteBuf, Entry> CODEC = PacketCodec.tuple(
			PacketCodecs.string(32), Entry::name,
			PacketCodecs.VAR_LONG, Entry::playTicks,
			PacketCodecs.VAR_INT, Entry::deaths,
			PacketCodecs.VAR_INT, Entry::mobKills,
			PacketCodecs.VAR_LONG, Entry::distanceCm,
			PacketCodecs.VAR_INT, Entry::diamonds,
			Entry::new);
	}

	public static final PacketCodec<RegistryByteBuf, BoardPayload> CODEC = PacketCodecs.<RegistryByteBuf, Entry, List<Entry>>collection(ArrayList::new, Entry.CODEC, MAX)
		.xmap(BoardPayload::new, BoardPayload::entries);

	@Override
	public Id<? extends CustomPayload> getId() {
		return ID;
	}
}
