var config = mw.config.get('wgFlowThreadConfig');
var canpost = mw.config.exists('canpost');

var replyBox = null;

/* Get avatar by user name */
function getAvatar(id, username) {
  if (id === 0) {
    return config.AnonymousAvatar;
  } else {
    return config.Avatar.replace(/\$\{username\}/g, username);
  }
}

/* Get user friendly time string (such as 1 hour age) */
function getTimeString(time) {
  var m = moment(time).locale(mw.config.get('wgUserLanguage'));
  var diff = Date.now() - time;
  if (0 < diff && diff < 24 * 3600 * 1000) {
    return m.fromNow();
  } else {
    return m.format('LL, HH:mm:ss');
  }
}

function Thread() {
  var template = '<div class="comment-thread"><div class="comment-post">'
    + '<div class="comment-avatar">'
    + '<img src=""></img>'
    // + '<div class="comment-hat">'
    // + '<img src=""></img>'
    // + '</div>'
    + '</div>'
    + '<div class="comment-body">'
    + '<div class="comment-user"></div>'
    + '<div class="comment-ip"></div>'
    + '<div class="comment-text"></div>'
    + '<div class="comment-footer">'
    + '<span class="comment-time"></span>'
    + '</div>'
    + '</div></div></div>';

  var object = $(template);

  this.post = null;
  this.object = object;
  this.deletionLock = false;

  $.data(object[0], 'thread', this);
}

Thread.fromId = function(id) {
  return $.data($('#comment-' + id)[0], 'thread');
}

Thread.prototype.init = function(post) {
  var object = this.object;
  this.post = post;
  object.attr('id', 'comment-' + post.id);

  var userlink;
  if (post.userid !== 0) {
    userlink = wrapPageLink('User:' + post.username, post.username);
  } else {
    userlink = '<span class="comment-guest">[' + mw.msg('flowthread-ui-guest') + ']&nbsp;</span>' + wrapText(post.username);
  }
  if (post.ip) {
    object.find('.comment-ip').html("IP: " + post.ip);
  } else {
    object.find('.comment-ip').hide();
  }
  object.find('.comment-user').html(userlink);
  object.find('.comment-avatar > img').attr('src', getAvatar(post.userid, post.username));
  object.find('.comment-text').html(post.text);
  object.find('.comment-time')
    .text(getTimeString(post.timestamp * 1000))
    .siblings().remove(); // Remove all button after init
}

Thread.prototype.addButton = function(type, text, listener) {
  return $('<span>')
    .addClass('comment-' + type)
    .text(text)
    .click(listener)
    .appendTo(this.object.find('.comment-footer'));
}

Thread.prototype.appendChild = function(thread) {
  this.object.append(thread.object);
}

Thread.prototype.prependChild = function(thread) {
  this.object.children('.comment-post').after(thread.object);
}

function wrapText(text) {
  var span = $('<span/>');
  span.text(text);
  return span.wrapAll('<div/>').parent().html();
}

function wrapPageLink(page, name) {
  var link = $('<a/>');
  link.attr('href', mw.util.getUrl(page));
  link.text(name);
  return link.wrapAll('<div/>').parent().html();
}

Thread.prototype.like = function() {
  var api = new mw.Api();
  api.get({
    action: 'flowthread',
    type: 'like',
    postid: this.post.id
  });
  this.object.find('.comment-like').first().attr('liked', '');
  this.object.find('.comment-report').first().removeAttr('reported');
}

Thread.prototype.dislike = function() {
  var api = new mw.Api();
  api.get({
    action: 'flowthread',
    type: 'dislike',
    postid: this.post.id
  });
  this.object.find('.comment-like').first().removeAttr('liked');
  this.object.find('.comment-report').first().removeAttr('reported');
}

Thread.prototype.report = function() {
  var api = new mw.Api();
  api.get({
    action: 'flowthread',
    type: 'report',
    postid: this.post.id
  });
  this.object.find('.comment-like').first().removeAttr('liked');
  this.object.find('.comment-report').first().attr('reported', '');
}

Thread.prototype.delete = function() {
  // Implements a mechanism for delete confirmation
  if (!this.deletionLock) {
    this.deletionLock = true;
    this.object.find('.comment-delete').first().text(mw.msg('flowthread-ui-delete_confirmation'));
    this.object.find('.comment-delete').first().css('color', 'rgb(163, 31,8)');
    var _this = this;
    setTimeout(function () {
      _this.deletionLock = false;
      _this.object.find('.comment-delete').first().removeAttr('style');
      _this.object.find('.comment-delete').first().text(mw.msg('flowthread-ui-delete'));
    }, 1500);
  } else {
    var api = new mw.Api();
    api.get({
      action: 'flowthread',
      type: 'delete',
      postid: this.post.id
    });
    this.deletionLock = false;
    this.object.remove();
  }
}

Thread.prototype.markAsPopular = function() {
  this.object.addClass('comment-popular');
  this.object.removeAttr('id');
}

Thread.prototype.reply = function() {
    if (replyBox) {
        replyBox.remove();
    }
    replyBox = createReplyBox(this.post);
    this.appendChild({
        object: replyBox
    });
}

Thread.sendComment = function(post, text, wikitext) {
  var api = new mw.Api();
  var req = {
    action: 'flowthread',
    type: 'post',
    pageid: mw.config.get('wgArticleId') || post.pageid,
    postid: post.id,
    nick: localStorage.flowthread_nick || "",
    content: text,
    wikitext: wikitext
  };
  api.post(req).done(reloadComments).fail(function(error, obj) {
    if (obj.error)
      showMsgDialog(obj.error.info);
    else if (error === 'http')
      showMsgDialog(mw.msg('flowthread-ui-networkerror'));
    else
      showMsgDialog(error);
  });
}

function ReplyBox() {
  var template = '<div class="comment-replybox">'
    + '<div class="comment-avatar">'
    + '<img src="' + getAvatar(mw.user.getId(), mw.user.id()) + '"></img>'
    + '</div>'
    + '<div class="comment-body">'
    + '<textarea placeholder="' + mw.msg('flowthread-ui-placeholder') + '"></textarea>'
    + '<div class="comment-preview" style="display:none;"></div>'
    + '<div class="comment-toolbar">'
    + '<input class="comment-nick" width="50px" placeholder="' + mw.msg('flowthread-ui-placeholder-nick') + '">'
    + '<button class="flowthread-btn flowthread-btn-wikitext' + (localStorage.flowthread_use_wikitext === 'true' ? ' on' : '') + '" title="' + mw.msg('flowthread-ui-usewikitext') + '"></button>'
    + '<button class="flowthread-btn flowthread-btn-preview" title="' + mw.msg('flowthread-ui-preview') + '"></button>'
    + '<button class="comment-submit">' + mw.msg('flowthread-ui-submit') + '</button>'
    + '</div>'
    + '</div></div>';

  var self = this;
  var object = $(template);
  this.object = object;

  object.find('textarea').keyup(function(e) {
    if (e.ctrlKey && e.which === 13) object.find('.comment-submit').click();
    self.pack();
  });

  if (mw.user.getId() !== 0) {
    object.find('.comment-nick').hide();
  } else {
    object.find('.comment-nick').val(localStorage.flowthread_nick);
    object.find('.comment-nick').keyup(function (e) {
      localStorage.flowthread_nick = object.find('.comment-nick').val();
    });
    localStorage.flowthread_use_wikitext = false;
    object.find('flowthread-btn-wikitext').hide();
    object.find('flowthread-btn-preview').hide();
  }

  object.find('.flowthread-btn-preview').click(function() {
    var obj = $(this);
    obj.toggleClass('on');

    var previewPanel = object.find('.comment-preview');

    if (obj.hasClass('on')) {
      object.find('textarea').hide();
      previewPanel.show();
      var val = self.getValue().trim();
      if (val) {
        var api = new mw.Api();
        api.get({
          action: 'parse',
          title: mw.config.get('wgTitle'),
          prop: 'text',
          preview: true,
          text: val
        }).done(function(result) {
          previewPanel.html(result.parse.text['*']);
        }).fail(function(error, obj) {
          showErrorDialog(error, obj);
        });
      }
    } else {
      object.find('textarea').show();
      previewPanel.hide();
    }
  });

  object.find('.flowthread-btn-wikitext').click(function() {
    var on = $(this).toggleClass('on').hasClass('on');
    if (!on) {
      object.find('.flowthread-btn-preview').removeClass('on');
      object.find('textarea').show();
      object.find('.comment-preview').hide();
    }
    localStorage.flowthread_use_wikitext = on;
  });

  object.find('.comment-submit').click(function() {
    if (self.onSubmit) self.onSubmit();
  });
}

function createReplyBox(parent) {
  var replyBox = new ReplyBox();

  replyBox.onSubmit = function() {
    var text = replyBox.getValue().trim();
    if (!text) {
      showMsgDialog(mw.msg('flowthread-ui-nocontent'));
      return;
    }
    replyBox.setValue('');
    Thread.sendComment(parent, text, replyBox.isInWikitextMode());
  };
  return replyBox.object;
}

ReplyBox.prototype.isInWikitextMode = function() {
  return this.object.find('.flowthread-btn-wikitext').hasClass('on');
};

ReplyBox.prototype.getValue = function() {
  return this.object.find('textarea').val();
};

ReplyBox.prototype.setValue = function(t) {
  return this.object.find('textarea').val(t);
};

ReplyBox.prototype.pack = function() {
  var textarea = this.object.find('textarea');
  textarea.height(1).height(Math.max(textarea[0].scrollHeight, 60));
}

function showMsgDialog(text) {
  alert(text);
}

function showErrorDialog(error, obj) {
  if (obj.error)
    showMsgDialog(obj.error.info);
  else if (error === 'http')
    showMsgDialog(mw.msg('flowthread-ui-networkerror'));
  else
    showMsgDialog(error);
}
