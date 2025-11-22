export class Entity {
    constructor(x, y, size, color, speed) {
        this.x = x;
        this.y = y;
        this.size = size;
        this.color = color;
        this.speed = speed;
        this.isDead = false;
    }

    update(deltaTime) {
        // Base update
    }

    draw(renderer) {
        // Base draw
    }
}

export class Projectile extends Entity {
    constructor(x, y, targetX, targetY, stats) {
        super(x, y, stats.size, '#f1c40f', stats.speed);

        const dx = targetX - x;
        const dy = targetY - y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        this.vx = (dx / dist) * this.speed;
        this.vy = (dy / dist) * this.speed;

        // Range determines lifetime: time = distance / speed
        this.lifeTime = stats.range / stats.speed;
        this.damage = stats.damage;
        this.pierce = stats.pierce;
        this.hitEnemies = [];
    }

    update(deltaTime) {
        this.x += this.vx * deltaTime;
        this.y += this.vy * deltaTime;
        this.lifeTime -= deltaTime;
        if (this.lifeTime <= 0) this.isDead = true;
    }

    draw(renderer) {
        renderer.drawCircle(this.x, this.y, this.size, this.color);
    }
}

export class ExpGem extends Entity {
    constructor(x, y, value) {
        super(x, y, 8, '#2ecc71', 0);
        this.value = value;
    }

    update(deltaTime) { }

    draw(renderer) {
        renderer.drawRect(this.x, this.y, this.size, this.size, this.color);
    }
}

export class Player extends Entity {
    constructor(x, y) {
        super(x, y, 15, '#3498db', 200);
        this.hp = 100;
        this.maxHp = 100;
        this.level = 1;
        this.exp = 0;
        this.nextLevelExp = 100;
        this.points = 0; // Upgrade points

        // Stats
        this.moveSpeed = 200; // Base speed
        this.magnet = 100;    // Pickup range

        // Projectile Stats
        this.pStats = {
            size: 5,
            speed: 400,
            damage: 10,
            count: 1,
            pierce: 0,
            cooldown: 0.5,
            range: 300,      // Pixel distance
            detection: 400,  // Enemy detection range
            spread: 0.2      // Spread angle in radians
        };

        this.attackTimer = 0;
    }

    update(deltaTime, input, enemies, spawnProjectileCallback) {
        let dx = 0;
        let dy = 0;

        if (input.keys['ArrowUp'] || input.keys['w']) dy -= 1;
        if (input.keys['ArrowDown'] || input.keys['s']) dy += 1;
        if (input.keys['ArrowLeft'] || input.keys['a']) dx -= 1;
        if (input.keys['ArrowRight'] || input.keys['d']) dx += 1;

        if (dx !== 0 || dy !== 0) {
            const length = Math.sqrt(dx * dx + dy * dy);
            dx /= length;
            dy /= length;
        }

        this.x += dx * this.moveSpeed * deltaTime;
        this.y += dy * this.moveSpeed * deltaTime;

        this.x = Math.max(this.size, Math.min(window.innerWidth - this.size, this.x));
        this.y = Math.max(this.size, Math.min(window.innerHeight - this.size, this.y));

        // Auto Attack
        this.attackTimer -= deltaTime;
        if (this.attackTimer <= 0 && enemies && enemies.length > 0) {
            const target = this.findNearestEnemy(enemies);
            if (target) {
                // Check detection range
                const dx = target.x - this.x;
                const dy = target.y - this.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist <= this.pStats.detection) {
                    for (let i = 0; i < this.pStats.count; i++) {
                        spawnProjectileCallback(this.x, this.y, target.x, target.y, this.pStats, i, this.pStats.count);
                    }
                    this.attackTimer = this.pStats.cooldown;
                }
            }
        }
    }

    findNearestEnemy(enemies) {
        let nearest = null;
        let minDist = Infinity;

        for (const enemy of enemies) {
            const dx = enemy.x - this.x;
            const dy = enemy.y - this.y;
            const dist = dx * dx + dy * dy;

            if (dist < minDist) {
                minDist = dist;
                nearest = enemy;
            }
        }
        return nearest;
    }

    draw(renderer) {
        // Draw Detection Range (Faint, dashed)
        renderer.ctx.save();
        renderer.ctx.beginPath();
        renderer.ctx.setLineDash([5, 5]);
        renderer.ctx.strokeStyle = 'rgba(52, 152, 219, 0.2)'; // Faint Blue
        renderer.ctx.lineWidth = 1;
        renderer.ctx.arc(this.x, this.y, this.pStats.detection, 0, Math.PI * 2);
        renderer.ctx.stroke();
        renderer.ctx.restore();

        // Draw Attack Range (Faint, solid)
        renderer.ctx.save();
        renderer.ctx.beginPath();
        renderer.ctx.strokeStyle = 'rgba(231, 76, 60, 0.2)'; // Faint Red
        renderer.ctx.lineWidth = 1;
        renderer.ctx.arc(this.x, this.y, this.pStats.range, 0, Math.PI * 2);
        renderer.ctx.stroke();
        renderer.ctx.restore();

        renderer.drawCircle(this.x, this.y, this.size, this.color);
        const hpPercent = Math.max(0, this.hp / this.maxHp);
        renderer.drawRect(this.x, this.y - 25, 40, 6, '#333');
        renderer.drawRect(this.x - 20 + (20 * hpPercent), this.y - 25, 40 * hpPercent, 6, '#e74c3c');
    }

    gainExp(amount, onLevelUp) {
        this.exp += amount;
        if (this.exp >= this.nextLevelExp) {
            this.levelUp(onLevelUp);
        }
    }

    levelUp(onLevelUp) {
        this.level++;
        this.points++; // Gain 1 point
        this.exp -= this.nextLevelExp;
        this.nextLevelExp = Math.floor(this.nextLevelExp * 1.2);
        this.hp = this.maxHp;
        console.log(`Level Up! Now level ${this.level}. Points: ${this.points}`);
        if (onLevelUp) onLevelUp();
    }
}

export class Enemy extends Entity {
    constructor(x, y, player, size, color, speed, hp, exp) {
        super(x, y, size, color, speed);
        this.player = player;
        this.hp = hp;
        this.expValue = exp;
    }

    update(deltaTime) {
        // Base behavior: Chase player
        const dx = this.player.x - this.x;
        const dy = this.player.y - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 0) {
            this.x += (dx / dist) * this.speed * deltaTime;
            this.y += (dy / dist) * this.speed * deltaTime;
        }
    }

    draw(renderer) {
        renderer.drawRect(this.x, this.y, this.size * 2, this.size * 2, this.color);
    }
}

export class Chaser extends Enemy {
    constructor(x, y, player) {
        super(x, y, player, 12, '#e74c3c', 100, 10, 10); // Red, Standard
    }
}

export class Tank extends Enemy {
    constructor(x, y, player) {
        super(x, y, player, 20, '#8e44ad', 50, 40, 30); // Purple, Big, Slow, Tanky
    }
}

export class Rusher extends Enemy {
    constructor(x, y, player) {
        super(x, y, player, 8, '#e67e22', 250, 5, 15); // Orange, Small, Fast, Weak
    }
}

export class Erratic extends Enemy {
    constructor(x, y, player) {
        super(x, y, player, 12, '#1abc9c', 120, 15, 20); // Teal
        this.angleOffset = 0;
        this.time = Math.random() * 100;
    }

    update(deltaTime) {
        this.time += deltaTime;
        const dx = this.player.x - this.x;
        const dy = this.player.y - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 0) {
            // Add sine wave to movement
            const angle = Math.atan2(dy, dx) + Math.sin(this.time * 5) * 0.5;
            this.x += Math.cos(angle) * this.speed * deltaTime;
            this.y += Math.sin(angle) * this.speed * deltaTime;
        }
    }
}

export class Drifter extends Enemy {
    constructor(x, y, player) {
        super(x, y, player, 15, '#95a5a6', 80, 20, 15); // Grey
        // Determine direction based on spawn position relative to center
        // Simple logic: Move towards the center of the screen and keep going.
        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;
        const dx = centerX - x;
        const dy = centerY - y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        this.vx = (dx / dist) * this.speed;
        this.vy = (dy / dist) * this.speed;
    }

    update(deltaTime) {
        this.x += this.vx * deltaTime;
        this.y += this.vy * deltaTime;
    }
}
