# Runs once per player (advancement luma:first_cat). Admins can repeat: /execute as <ник> at @s run function luma:give_cat
execute store result score @s luma.cat run random value 0..2
data modify storage luma:cat uuid set from entity @s UUID
data modify storage luma:cat model set value "touhou_little_maid:chen"
execute if score @s luma.cat matches 1 run data modify storage luma:cat model set value "touhou_little_maid:kaenbyou_rin"
execute if score @s luma.cat matches 2 run data modify storage luma:cat model set value "touhou_little_maid:goutokuzi_mike"
function luma:summon_cat with storage luma:cat
tellraw @s [{"text": "✦ ", "color": "#d4ff3d"}, {"text": "Знакомься: это твоя кошкодевочка. Нажми по ней ПКМ — откроется её меню.", "color": "#f3f5f0"}]
