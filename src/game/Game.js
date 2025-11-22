import { Renderer } from './Renderer.js';
import { Player, Projectile, ExpGem, Chaser, Tank, Rusher, Erratic, Drifter } from './entities/Entities.js';

export class Game {
    constructor() {
        this.renderer = new Renderer('gameCanvas');
        this.player = new Player(window.innerWidth / 2, window.innerHeight / 2);
        this.enemies = [];
        this.projectiles = [];
        this.gems = [];
        this.lastTime = 0;
        this.input = { keys: {} };
        this.score = 0;
        this.isGameOver = false;
        this.isLevelingUp = false;

        // Spawner settings
        this.spawnTimer = 0;
        this.spawnInterval = 1.0;

        // Enemy Spawn Weights
        this.spawnWeights = {
            'Chaser': 100,
            'Tank': 0,
            'Rusher': 0,
            'Erratic': 0,
            'Drifter': 0
        };
        this.enemyTypes = {
            'Chaser': Chaser,
            'Tank': Tank,
            'Rusher': Rusher,
            'Erratic': Erratic,
            'Drifter': Drifter
        };

        this.setupInput();
        this.loop = this.loop.bind(this);
        requestAnimationFrame(this.loop);
    }

    setupInput() {
        window.addEventListener('keydown', (e) => this.input.keys[e.key] = true);
        window.addEventListener('keyup', (e) => this.input.keys[e.key] = false);

        document.getElementById('restart-btn').addEventListener('click', () => this.restart());
    }

    restart() {
        console.log('Restarting game...');
        this.player = new Player(window.innerWidth / 2, window.innerHeight / 2);
        this.enemies = [];
        this.projectiles = [];
        this.gems = [];
        this.score = 0;
        this.isGameOver = false;
        this.isLevelingUp = false;

        this.spawnWeights = {
            'Chaser': 100,
            'Tank': 0,
            'Rusher': 0,
            'Erratic': 0,
            'Drifter': 0
        };

        const gameOverEl = document.getElementById('game-over');
        if (gameOverEl) {
            gameOverEl.classList.add('hidden');
        } else {
            console.error('Game Over element not found!');
        }

        this.lastTime = performance.now();
        requestAnimationFrame(this.loop);
    }

    spawnEnemy() {
        // Determine type based on weights
        const totalWeight = Object.values(this.spawnWeights).reduce((a, b) => a + b, 0);
        let random = Math.random() * totalWeight;
        let TypeToSpawn = Chaser;

        for (const [type, weight] of Object.entries(this.spawnWeights)) {
            random -= weight;
            if (random <= 0) {
                TypeToSpawn = this.enemyTypes[type];
                break;
            }
        }

        // Spawn at random edge
        let x, y;
        if (Math.random() < 0.5) {
            x = Math.random() < 0.5 ? -50 : window.innerWidth + 50;
            y = Math.random() * window.innerHeight;
        } else {
            x = Math.random() * window.innerWidth;
            y = Math.random() < 0.5 ? -50 : window.innerHeight + 50;
        }
        this.enemies.push(new TypeToSpawn(x, y, this.player));
    }

    update(deltaTime) {
        if (this.isGameOver || this.isLevelingUp) return;

        // Player
        this.player.update(deltaTime, this.input, this.enemies, (x, y, tx, ty, stats, index, count) => {
            // Spread logic
            let angle = Math.atan2(ty - y, tx - x);
            if (count > 1) {
                const spread = stats.spread;
                const startAngle = angle - (spread * (count - 1)) / 2;
                angle = startAngle + spread * index;
                tx = x + Math.cos(angle) * 100;
                ty = y + Math.sin(angle) * 100;
            }
            this.projectiles.push(new Projectile(x, y, tx, ty, stats));
        });

        // Projectiles
        this.projectiles.forEach(p => p.update(deltaTime));
        this.projectiles = this.projectiles.filter(p => !p.isDead);

        // Enemies
        this.spawnTimer += deltaTime;
        if (this.spawnTimer >= this.spawnInterval) {
            this.spawnEnemy();
            this.spawnTimer = 0;
            if (this.spawnInterval > 0.2) this.spawnInterval -= 0.01;
        }

        this.enemies.forEach(enemy => enemy.update(deltaTime));

        // Gems
        this.gems.forEach(gem => gem.update(deltaTime));

        // Collision: Projectile vs Enemy
        for (const p of this.projectiles) {
            for (const enemy of this.enemies) {
                if (enemy.isDead) continue;
                if (p.hitEnemies.includes(enemy)) continue;

                const dx = p.x - enemy.x;
                const dy = p.y - enemy.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < p.size + enemy.size) {
                    enemy.hp -= p.damage;
                    p.hitEnemies.push(enemy);

                    if (p.hitEnemies.length > p.pierce) {
                        p.isDead = true;
                    }

                    if (enemy.hp <= 0) {
                        enemy.isDead = true;
                        this.score += 10;
                        this.gems.push(new ExpGem(enemy.x, enemy.y, enemy.expValue));
                    }
                    if (p.isDead) break;
                }
            }
        }

        // Collision: Enemy vs Player
        for (const enemy of this.enemies) {
            if (enemy.isDead) continue;
            const dx = this.player.x - enemy.x;
            const dy = this.player.y - enemy.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < this.player.size + enemy.size) {
                this.player.hp -= 10;
                enemy.isDead = true;
                if (this.player.hp <= 0) {
                    this.gameOver();
                }
            }
        }

        // Collision: Player vs Gems
        for (const gem of this.gems) {
            const dx = this.player.x - gem.x;
            const dy = this.player.y - gem.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < this.player.size + gem.size + this.player.magnet) {
                gem.isDead = true;
                this.player.gainExp(gem.value, () => this.triggerLevelUp());
            }
        }
        this.gems = this.gems.filter(g => !g.isDead);

        // Cleanup far away enemies
        this.enemies = this.enemies.filter(e => {
            if (e.isDead) return false;
            const dx = e.x - this.player.x;
            const dy = e.y - this.player.y;
            return (dx * dx + dy * dy) < 2000 * 2000;
        });

        this.updateUI();
    }

    updateUI() {
        const hpBar = document.getElementById('hp-bar');
        const scoreEl = document.getElementById('score');

        const hpPercent = Math.max(0, (this.player.hp / this.player.maxHp) * 100);
        hpBar.style.width = `${hpPercent}%`;
        scoreEl.textContent = `スコア: ${this.score} | レベル: ${this.player.level} | Pt: ${this.player.points}`;
    }

    triggerLevelUp() {
        this.isLevelingUp = true;
        const modal = document.getElementById('upgrade-modal');
        const optionsContainer = document.getElementById('upgrade-options');
        optionsContainer.innerHTML = '';
        modal.classList.remove('hidden');

        const modalHeader = modal.querySelector('h2');
        modalHeader.innerText = `ショップ - 所持ポイント: ${this.player.points}`;

        const upgrades = this.getAllUpgrades();

        // Split upgrades
        const playerUpgrades = upgrades.filter(u => !u.type.startsWith('enemy_'));
        const enemyUpgrades = upgrades.filter(u => u.type.startsWith('enemy_'));

        // Helper to create section
        const createSection = (title, items) => {
            const section = document.createElement('div');
            section.className = 'shop-section';
            section.innerHTML = `<h3>${title}</h3>`;

            const grid = document.createElement('div');
            grid.className = 'upgrade-grid';

            items.forEach(upgrade => {
                const card = document.createElement('div');
                card.className = 'upgrade-card shop-card';

                if (this.player.points < upgrade.cost) {
                    card.classList.add('disabled');
                }

                if (upgrade.type.startsWith('enemy_')) {
                    card.style.borderColor = upgrade.cost === 0 ? '#2ecc71' : '#e74c3c';
                }

                card.innerHTML = `
                    <h4>${upgrade.name}</h4>
                    <p>${upgrade.description}</p>
                    <div class="cost">${upgrade.cost > 0 ? upgrade.cost + ' Pt' : '無料'}</div>
                `;

                card.onclick = () => {
                    if (this.player.points >= upgrade.cost) {
                        this.player.points -= upgrade.cost;
                        this.applyUpgrade(upgrade);
                        this.triggerLevelUp();
                    }
                };
                grid.appendChild(card);
            });
            section.appendChild(grid);
            return section;
        };

        optionsContainer.appendChild(createSection('プレイヤー強化', playerUpgrades));
        optionsContainer.appendChild(createSection('敵出現管理', enemyUpgrades));

        // Skip / Close Button
        let skipBtn = modal.querySelector('.skip-btn');
        if (!skipBtn) {
            skipBtn = document.createElement('button');
            skipBtn.className = 'skip-btn';
            skipBtn.innerText = '閉じる / スキップ';
            skipBtn.onclick = () => {
                modal.classList.add('hidden');
                this.isLevelingUp = false;
                this.lastTime = performance.now();
                requestAnimationFrame(this.loop);
            };
            modal.appendChild(skipBtn);
        }
    }

    getAllUpgrades() {
        const upgrades = [
            { type: 'size', name: '巨大弾', description: 'サイズ +50%', cost: 1, apply: (p) => p.pStats.size *= 1.5 },
            { type: 'speed', name: '高速弾', description: '弾速 +20%', cost: 1, apply: (p) => p.pStats.speed *= 1.2 },
            { type: 'damage', name: 'パワーアップ', description: 'ダメージ +5', cost: 1, apply: (p) => p.pStats.damage += 5 },
            { type: 'count', name: 'マルチショット', description: '発射数 +1', cost: 3, apply: (p) => p.pStats.count += 1 },
            { type: 'pierce', name: 'ドリル', description: '貫通数 +1', cost: 2, apply: (p) => p.pStats.pierce += 1 },
            { type: 'cooldown', name: '連射', description: '連射速度 +15%', cost: 1, apply: (p) => p.pStats.cooldown *= 0.85 },
            { type: 'magnet', name: 'マグネット', description: '取得範囲 +50', cost: 1, apply: (p) => p.magnet += 50 },
            { type: 'range', name: 'スナイパー', description: '射程 +100', cost: 1, apply: (p) => p.pStats.range += 100 },
            { type: 'detection', name: 'レーダー', description: '索敵範囲 +100', cost: 1, apply: (p) => p.pStats.detection += 100 },
            { type: 'moveSpeed', name: '俊足', description: '移動速度 +20', cost: 1, apply: (p) => p.moveSpeed += 20 },
            { type: 'spread_up', name: 'ワイド', description: '拡散 +10°', cost: 1, apply: (p) => p.pStats.spread += 0.17 },
            { type: 'spread_down', name: 'フォーカス', description: '拡散 -10°', cost: 1, apply: (p) => p.pStats.spread = Math.max(0, p.pStats.spread - 0.17) },
        ];

        const enemyTypes = ['Tank', 'Rusher', 'Erratic', 'Drifter'];
        enemyTypes.forEach(type => {
            upgrades.push({
                type: `enemy_add_${type}`,
                name: `${type} 追加`,
                description: `出現率 +20 (無料)`,
                cost: 0,
                apply: () => this.spawnWeights[type] += 20
            });

            if (this.spawnWeights[type] > 0) {
                upgrades.push({
                    type: `enemy_remove_${type}`,
                    name: `${type} 削減`,
                    description: `出現率 -20 (1 Pt)`,
                    cost: 1,
                    apply: () => this.spawnWeights[type] = Math.max(0, this.spawnWeights[type] - 20)
                });
            }
        });

        upgrades.push({
            type: 'enemy_add_Chaser',
            name: 'Chaser 追加',
            description: '出現率 +20 (無料)',
            cost: 0,
            apply: () => this.spawnWeights['Chaser'] += 20
        });
        if (this.spawnWeights['Chaser'] > 0) {
            upgrades.push({
                type: 'enemy_remove_Chaser',
                name: 'Chaser 削減',
                description: '出現率 -20 (1 Pt)',
                cost: 1,
                apply: () => this.spawnWeights['Chaser'] = Math.max(0, this.spawnWeights['Chaser'] - 20)
            });
        }

        return upgrades;
    }

    applyUpgrade(upgrade) {
        if (upgrade.type.startsWith('enemy_')) {
            upgrade.apply();
        } else {
            upgrade.apply(this.player);
        }
        console.log(`Applied upgrade: ${upgrade.name}`);
    }

    draw() {
        this.renderer.clear();
        this.gems.forEach(gem => gem.draw(this.renderer));
        this.projectiles.forEach(p => p.draw(this.renderer));
        this.enemies.forEach(enemy => enemy.draw(this.renderer));
        this.player.draw(this.renderer);
    }

    gameOver() {
        console.log('Game Over!');
        this.isGameOver = true;
        document.getElementById('game-over').classList.remove('hidden');
    }

    loop(timestamp) {
        if (this.isGameOver && !this.input.keys['r']) {
            // Game Over state
        }

        if (this.isLevelingUp) {
            return;
        }

        const deltaTime = (timestamp - this.lastTime) / 1000;
        this.lastTime = timestamp;

        if (!this.isGameOver) {
            this.update(deltaTime);
            this.draw();
            requestAnimationFrame(this.loop);
        }
    }
}
