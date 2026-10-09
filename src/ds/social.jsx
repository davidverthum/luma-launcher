// Social: FriendRow and PartyDock — play together before the game even starts.
import { cx } from './util.js';
import { Icon } from './icons.jsx';
import { Button, IconButton, RankBadge } from './controls.jsx';
import { PlayerHead } from './head.jsx';
import * as React from 'react';

const ACT = { ingame: 'В игре', online: 'В лаунчере', away: 'Отошёл', offline: 'Не в сети' };

/** FriendRow — who, where, and the one thing you can do about it. */
export function FriendRow({ name, status = 'online', activity, realmColor, rank, action, onAction, compact = false, className }) {
  const act = action || (status === 'ingame' ? 'join' : status === 'online' ? 'invite' : null);
  return (
    <div className={cx('lm-friend', 'is-' + status, className)} style={realmColor ? { '--realm': realmColor } : undefined}>
      <PlayerHead name={name} size={40} status={status} color={status === 'ingame' ? realmColor : undefined} />
      <div className="lm-friend-text">
        <div className="lm-friend-name"><span className="body-strong">{name}</span>{rank ? <RankBadge rank={rank} size="sm" /> : null}</div>
        <div className="lm-friend-act">{status === 'ingame' && realmColor ? <i className="lm-friend-realm" /> : null}{activity || ACT[status]}</div>
      </div>
      {act === 'join' ? (compact
        ? <IconButton icon="play" label={'Играть вместе с ' + name} size="sm" variant="glass" onClick={onAction} className="lm-friend-join" />
        : <Button size="sm" variant="glass" onClick={onAction}>Играть вместе</Button>) : null}
      {act === 'invite' ? <IconButton icon="plus" label={'Позвать ' + name + ' в пати'} size="sm" variant="glass" onClick={onAction} /> : null}
    </div>
  );
}

/** PartyDock — slots for the party. Everyone ready → the whole party enters the same world. */
export function PartyDock({ members = [{ name: 'Nyx_', leader: true, ready: true }, { name: 'Lex_', ready: true }], size = 4, realm = 'Техномагия', onInvite, className }) {
  const slots = Array.from({ length: size }, (_, i) => members[i] || null);
  const ready = members.filter((m) => m.ready).length;
  return (
    <div className={cx('lm-party', className)}>
      <div className="lm-party-head">
        <span className="overline">Пати</span>
        <span className="lm-party-count"><span className="lm-led">{members.length}/{size}</span></span>
        <span className="lm-party-realm caption">→ {realm}</span>
      </div>
      <div className="lm-party-slots">
        {slots.map((m, i) => m ? (
          <div key={m.name} className={cx('lm-party-slot', m.ready && 'is-ready')} title={m.name + (m.ready ? ' · готов' : ' · не готов')}>
            <PlayerHead name={m.name} size={40} />
            {m.leader ? <span className="lm-party-crown" aria-label="лидер"><Icon name="crown" size={12} /></span> : null}
            <span className="lm-party-name caption">{m.name}</span>
          </div>
        ) : (
          <button key={'e' + i} type="button" className="lm-party-slot is-empty" onClick={onInvite} aria-label="Позвать в пати">
            <Icon name="plus" size={24} />
          </button>
        ))}
      </div>
      <div className="lm-party-foot caption">{ready === members.length ? 'Все готовы — запуск вместе' : `Готовы ${ready} из ${members.length}`}</div>
    </div>
  );
}
