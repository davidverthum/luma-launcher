package gg.luma.cosmetics.mixin;

import gg.luma.cosmetics.client.Badges;
import net.minecraft.client.network.AbstractClientPlayerEntity;
import net.minecraft.client.render.VertexConsumerProvider;
import net.minecraft.client.render.entity.EntityRendererFactory;
import net.minecraft.client.render.entity.LivingEntityRenderer;
import net.minecraft.client.render.entity.PlayerEntityRenderer;
import net.minecraft.client.render.entity.model.PlayerEntityModel;
import net.minecraft.client.util.math.MatrixStack;
import net.minecraft.text.Text;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.ModifyVariable;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** The name over a player's head: crown and color on the name, the title a line above it. */
@Mixin(PlayerEntityRenderer.class)
abstract class PlayerEntityRendererMixin extends LivingEntityRenderer<AbstractClientPlayerEntity, PlayerEntityModel<AbstractClientPlayerEntity>> {
	private static final String LABEL = "renderLabelIfPresent(Lnet/minecraft/client/network/AbstractClientPlayerEntity;Lnet/minecraft/text/Text;Lnet/minecraft/client/util/math/MatrixStack;Lnet/minecraft/client/render/VertexConsumerProvider;IF)V";
	/** Vanilla's own step from the below-name score up to the name. */
	private static final float LINE = 9.0F * 1.15F * 0.025F;

	PlayerEntityRendererMixin(EntityRendererFactory.Context ctx, PlayerEntityModel<AbstractClientPlayerEntity> model, float shadowRadius) {
		super(ctx, model, shadowRadius);
	}

	@ModifyVariable(method = LABEL, at = @At("HEAD"), argsOnly = true)
	private Text luma$name(Text text, AbstractClientPlayerEntity player) {
		return Badges.name(player.getUuid(), text);
	}

	/** Right before the name is drawn (the second label call; the first is the below-name score). */
	@Inject(method = LABEL, at = @At(value = "INVOKE", ordinal = 1,
		target = "Lnet/minecraft/client/render/entity/LivingEntityRenderer;renderLabelIfPresent(Lnet/minecraft/entity/Entity;Lnet/minecraft/text/Text;Lnet/minecraft/client/util/math/MatrixStack;Lnet/minecraft/client/render/VertexConsumerProvider;IF)V"))
	private void luma$title(AbstractClientPlayerEntity player, Text text, MatrixStack matrices, VertexConsumerProvider consumers, int light, float tickDelta, CallbackInfo ci) {
		Text title = Badges.title(player.getUuid());
		if (title == null) return;
		matrices.push();
		matrices.translate(0.0F, LINE, 0.0F);
		super.renderLabelIfPresent(player, title, matrices, consumers, light, tickDelta);
		matrices.pop();
	}
}
