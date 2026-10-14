package gg.luma.cosmetics;

import java.util.ArrayList;
import java.util.List;
import net.minecraft.network.RegistryByteBuf;
import net.minecraft.network.codec.PacketCodec;
import net.minecraft.network.codec.PacketCodecs;
import net.minecraft.network.packet.CustomPayload;
import net.minecraft.util.Identifier;

/** Server → client: how far the player is towards each title (have ≥ need — unlocked), for the wardrobe. */
public record TitlesPayload(List<Progress> titles) implements CustomPayload {
	public static final Id<TitlesPayload> ID = new Id<>(Identifier.of(Cosmetics.MOD_ID, "titles"));

	public record Progress(String id, long have, long need) {
		public static final PacketCodec<RegistryByteBuf, Progress> CODEC = PacketCodec.tuple(
			PacketCodecs.string(32), Progress::id,
			PacketCodecs.VAR_LONG, Progress::have,
			PacketCodecs.VAR_LONG, Progress::need,
			Progress::new);
	}

	public static final PacketCodec<RegistryByteBuf, TitlesPayload> CODEC = PacketCodecs.<RegistryByteBuf, Progress, List<Progress>>collection(ArrayList::new, Progress.CODEC, 64)
		.xmap(TitlesPayload::new, TitlesPayload::titles);

	@Override
	public Id<? extends CustomPayload> getId() {
		return ID;
	}
}
