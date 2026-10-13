package gg.luma.cosmetics;

import net.minecraft.network.RegistryByteBuf;
import net.minecraft.network.codec.PacketCodec;
import net.minecraft.network.packet.CustomPayload;
import net.minecraft.util.Identifier;

/** Client → server: «send me the leaderboard». */
public record BoardRequestPayload() implements CustomPayload {
	public static final BoardRequestPayload INSTANCE = new BoardRequestPayload();
	public static final Id<BoardRequestPayload> ID = new Id<>(Identifier.of(Cosmetics.MOD_ID, "board_request"));
	public static final PacketCodec<RegistryByteBuf, BoardRequestPayload> CODEC = PacketCodec.unit(INSTANCE);

	@Override
	public Id<? extends CustomPayload> getId() {
		return ID;
	}
}
